import { defineConfig, devices } from "@playwright/test";

// The FS-7 echelon 2 variant of playwright.live.config.ts. Its ONLY difference is `testMatch`:
// this config runs `reports-download-walk.spec.ts` alone, against the SAME live stack
// (`serve-live.mjs`) that the interview walk uses. A second config rather than a widened
// `testMatch` on the first, for the reason that file already gives about its own siblings: the
// two walks need different fixtures, and a config that ran both would make either harness's
// missing env silently skip the other's spec.

const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";

export default defineConfig({
  testDir: "..",
  testMatch: "reports-download-walk.spec.ts",
  outputDir: "./.artifacts-reports",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // Two real page loads plus a real download round trip through the runtime and the object store.
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: appOrigin,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    // The walk's whole subject is a file arriving on disk.
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Relative to THIS config file's own directory (Playwright's default webServer cwd) — the same
    // trap playwright.live.config.ts documents: "node e2e/live-stack/serve-live.mjs" would double
    // the path from here.
    command: "node serve-live.mjs",
    url: "http://127.0.0.1:3101/signup",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
