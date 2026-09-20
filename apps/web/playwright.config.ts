import { defineConfig, devices } from "@playwright/test";

const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
// Kept in step with `e2e/serve-built.mjs`, which owns the two INTERNAL ports and
// reads the same variable — see its header for why they are configurable at all
// (two lanes on one host). A string here, deliberately: this value is only ever
// interpolated into the readiness URL, while serve-built coerces to Number for
// `httpRequest`'s `port`. Same env var, one default, two shapes at their two
// call sites — which is why a named const beats re-reading `process.env` inline.
const nextPort = process.env.CLARA_E2E_NEXT_PORT ?? "3101";

export default defineConfig({
  testDir: "./e2e",
  // #851 — THE BROWSER WALKS ONLY. This directory holds two runners' files: `*.spec.ts` is
  // Playwright's, `*.test.ts` is `node:test`'s (declared in `test/manifest.txt`, run by
  // `scripts/run-tests.mjs`). Playwright's stock `testMatch` is
  // `**/*.@(spec|test).?(c|m)[jt]s?(x)` — it takes BOTH — so a filterless run `import`-ed the
  // node:test files too and their assertions ran inside the Playwright process, reported by
  // nobody. Narrowing here is the fix; `e2e/spec-discovery.test.ts` is the cell that holds it.
  testMatch: /.*\.spec\.ts$/,
  outputDir: "./e2e/.artifacts",
  // #804 — polls the HTTPS app origin's own `/login` (the origin the browser actually drives,
  // not only this file's own `webServer.url` probe of the internal Next port) until it genuinely
  // answers, so the walk suite's first sign-in never pays a cold server's first-hit cost. See
  // `e2e/global-setup.ts`'s own header for the measurement and why this seam runs after
  // `webServer` and before every test file.
  globalSetup: "./e2e/global-setup.ts",
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
    // #865 — THIS COMMAND DOES NOT BUILD. `serve-built.mjs` runs `next start` against
    // whatever `.next/` already holds; only `pnpm --filter @clara/web e2e` (`e2e/run.mjs`)
    // builds first. A bare `npx playwright test`, or an IDE's own Playwright runner, invokes
    // this `webServer.command` directly and silently serves a STALE build — measured on the
    // #648 fix round: a 19-minute-stale build produced a false failure. Always run the browser
    // suite as `pnpm --filter @clara/web e2e`, never `npx playwright test` directly.
    command: "node e2e/serve-built.mjs",
    // Readiness probes the built Next server directly. The browser itself uses
    // the HTTPS origin above so production's same-origin wall is exercised.
    url: `http://127.0.0.1:${nextPort}/signup`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
