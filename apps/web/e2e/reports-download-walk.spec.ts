// FS-7 echelon 2 — 裁-86's mandatory browser leg for the artifact download (裁-96②).
//
// WHAT THIS WALK PROVES THAT NOTHING ELSE CAN. Every other cell in this train stops one layer
// short of a person: the database battery proves the gate, the runtime battery proves the route
// returns bytes to a `fetch`, and the component battery proves the control renders. None of them
// proves that a HUMAN, signed in, on the built app, clicking Download, receives a file. This does
// — the click is a real click, the download is Playwright's own download event, and the bytes on
// disk are hashed against what the database sealed.
//
// THE STACK IS REAL, END TO END: a real Chromium against the BUILT Next app, a real same-origin
// proxy, a real @clara/runtime, a real PostgREST with genuine RLS, and a real Postgres carrying a
// real completed sandbox export whose object sits at its content address. `run-reports-download-
// walk.mjs` provisions all of it and passes the ids in.
//
// THE ARTIFACT IS A SANDBOX EXPORT, and that is a scoping choice with a reason: it is the family
// reachable from a bare firm, while a sealed report artifact needs the whole epsilon chain (spec →
// run → dataset seal → claim assessment) whose fixtures live in packages/db. Both families go
// through ONE door and ONE route, and packages/db/tests/fs7-e2-artifact-download.test.mjs proves
// both of them there; what is unproven without this file is the BROWSER's half, and the browser
// cannot tell the two families apart.

import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CLIENT_ID = process.env.CLARA_E2E_REPORTS_CLIENT_ID ?? "";
const ARTIFACT_ID = process.env.CLARA_E2E_REPORTS_ARTIFACT_ID ?? "";
const EXPECTED_SHA = process.env.CLARA_E2E_REPORTS_ARTIFACT_SHA256 ?? "";
const EXPECTED_BYTES = Number(process.env.CLARA_E2E_REPORTS_ARTIFACT_BYTES ?? "0");
const PENDING_ID = process.env.CLARA_E2E_REPORTS_PENDING_ARTIFACT_ID ?? "";

const provisioned = CLIENT_ID !== "" && ARTIFACT_ID !== "" && /^[0-9a-f]{64}$/.test(EXPECTED_SHA);

/**
 * A real session through the real /login form.
 *
 * NOT interview-walk.spec.ts's confirm-link recipe, and the difference is a measurement rather
 * than a preference: the confirm FACE has moved to a six-digit OTP whose handler runs the C1/C2
 * attempt wall BEFORE `verifyOtp`, and that wall's production seam returns `"unavailable"`
 * unconditionally on this tip (Lane B's runtime route is not built). The confirm face therefore
 * signs nobody in, in a browser, today — its own walk is dead for the same reason, and this file
 * says so rather than inheriting a recipe that cannot work.
 *
 * The password never reaches a real identity provider — `serve-live.mjs` answers the grant with a
 * genuinely signed token for the fixture owner. Everything after that is real: the app's own
 * @supabase/ssr client writes its own cookies, and every later read carries them.
 */
async function establishSession(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

const reportsHref = () => `/clients/${encodeURIComponent(CLIENT_ID)}/reports`;

test.describe("FS-7 e2 — the Reports tab download, in a real browser", () => {
  test.skip(!provisioned, "run-reports-download-walk.mjs supplies the client/artifact fixture");

  test("a signed-in member opens Reports, clicks Download, and receives the sealed PDF bytes", async ({ page }) => {
    await establishSession(page);
    await page.goto(reportsHref());
    // level:1 AND exact — "Reports" is also a prefix of the "Statutory close reports" h2, which is
    // a genuine Playwright strict-mode ambiguity rather than a product defect.
    await expect(page.getByRole("heading", { name: "Reports", exact: true, level: 1 }))
      .toBeVisible({ timeout: 30_000 });

    // THE CONTROL EXISTS BECAUSE THE DOOR SAID SO. The offer read is a live PostgREST RPC against
    // clara.list_downloadable_artifacts, so a control here is already evidence that the gate
    // executed and said yes — a UI that had derived the flag locally would render one either way.
    const download = page.getByTestId("artifact-download").first();
    await expect(download).toBeVisible({ timeout: 30_000 });

    const [file] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      download.click(),
    ]);

    // THE FILENAME IS THE SERVER'S, derived from the content address — never composed here and
    // never taken from a row the browser read.
    expect(file.suggestedFilename()).toMatch(/^clara-sandbox-export-[0-9a-f]{12}\.pdf$/);

    const path = await file.path();
    expect(path, "Playwright must have saved the download to disk").toBeTruthy();
    const bytes = readFileSync(path!);

    // A REAL PDF, and the RIGHT one: the magic number says it is a PDF, and the hash says it is
    // the exact object the database recorded. Size alone would pass on a login page.
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(0);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA);
    if (EXPECTED_BYTES > 0) expect(bytes.length).toBe(EXPECTED_BYTES);
  });

  test("an UNFINISHED export shows the door's own refusal reason and NO control", async ({ page }) => {
    test.skip(PENDING_ID === "", "the harness supplies a second, unfinished export");
    await establishSession(page);
    await page.goto(reportsHref());
    // level:1 AND exact — "Reports" is also a prefix of the "Statutory close reports" h2, which is
    // a genuine Playwright strict-mode ambiguity rather than a product defect.
    await expect(page.getByRole("heading", { name: "Reports", exact: true, level: 1 }))
      .toBeVisible({ timeout: 30_000 });

    // THE DISCRIMINATING POST-CONDITION: the page carries BOTH a downloadable row (a control) and
    // a refused one (the database's own typed reason). A page with neither, or with a control on
    // every row, fails — which is what makes this cell about the gate rather than about rendering.
    await expect(page.getByTestId("artifact-download").first()).toBeVisible({ timeout: 30_000 });
    const refused = page.getByTestId("artifact-download-unavailable").first();
    await expect(refused).toBeVisible({ timeout: 30_000 });
    await expect(refused).toContainText("sandbox_export_not_complete");
  });
});
