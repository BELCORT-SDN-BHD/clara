import { defineConfig, devices } from "@playwright/test";

// The live-stack variant of ../../playwright.config.ts (that file's own
// webServer is pinned to serve-built.mjs's mocked Supabase — file-disjoint by
// construction, matching this repo's one-harness-per-stack-shape precedent).
// This config's ONLY differences: `testMatch` runs interview-walk.spec.ts
// alone (the other two specs are written against the mock and must not run
// against a real backend), and `webServer.command` boots serve-live.mjs
// instead. Everything else — TLS trust, viewport, trace retention — is
// copied verbatim.

const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";

export default defineConfig({
  testDir: "..",
  testMatch: "interview-walk.spec.ts",
  outputDir: "./.artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // The COMPLETE arm walks all 17 CLIENT_SEG_KEYS segments plus the
  // untracked accounting_basis prompt, each a real network round trip
  // through the live runtime — Playwright's 30s default test timeout
  // measured well short (a real "Test timeout of 30000ms exceeded" on the
  // first live run). ../../playwright.config.ts never needed this: its
  // specs are pre-auth UI-only walks with no comparable segment count.
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: appOrigin,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Relative to THIS config file's own directory (Playwright's default
    // webServer cwd) — this config lives beside serve-live.mjs, unlike
    // ../../playwright.config.ts, whose own "node e2e/serve-built.mjs" is
    // relative to apps/web instead. A copy-paste of that path here doubles
    // to e2e/live-stack/e2e/live-stack/serve-live.mjs — measured, not
    // guessed (the exact MODULE_NOT_FOUND this comment exists to prevent).
    command: "node serve-live.mjs",
    url: "http://127.0.0.1:3101/signup",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
