import { defineConfig, devices } from "@playwright/test";

const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: appOrigin,
    ignoreHTTPSErrors: true,
    // The address a real edge proxy would have observed. The harness points
    // `CLARA_TRUSTED_CLIENT_IP_HEADER` at this name precisely BECAUSE Next
    // never fills it in (unlike `x-forwarded-for`, which it synthesizes from
    // the socket), so a spec that wants the fail-closed arm can drop it per
    // request and actually reach that branch.
    extraHTTPHeaders: { "x-clara-e2e-client-ip": "203.0.113.7" },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node e2e/serve-built.mjs",
    // Readiness probes the built Next server directly. The browser itself uses
    // the HTTPS origin above so production's same-origin wall is exercised.
    url: `http://127.0.0.1:${process.env.CLARA_E2E_NEXT_PORT ?? 3101}/signup`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
