import { request, type FullConfig } from "@playwright/test";

/**
 * #804 — THE READINESS GATE, on the origin the BROWSER actually drives.
 *
 * `playwright.config.ts`'s own `webServer.url` only confirms the built Next server answers
 * `/signup` on the INTERNAL HTTP port — `serve-built.mjs`'s `next start` child. The browser
 * itself drives the HTTPS app origin that same file's proxy terminates, and nothing probed that
 * leg, the `/login` route specifically, or the mock auth handlers behind it before the walk
 * suite's first sign-in. `serve-built.mjs` brings its HTTPS proxy up and only then spawns
 * `next start`, and it hosts the mock auth server in the same process, so the FIRST real sign-in
 * paid first-hit cost on routes and handlers the boot probe never touched — the measured cause of
 * the intermittent `navigation[name=Main]` timeout this ticket exists to close (#804, per
 * `docs/plan/active/refresh-wave-2026-09-14/reports/624-fixround.md`).
 *
 * `globalSetup` runs once, after `webServer` is already confirmed up and before any test file (so
 * before any sign-in) — exactly the seam this gate needs. It polls the ACTUAL browser origin's
 * `/login` route, ignoring the self-signed certificate `serve-built.mjs` mints for itself, until
 * it genuinely answers — never a fixed sleep: a host that is already warm returns on its FIRST
 * poll, so a passing run's wall-clock is unchanged, and a host that cannot come up within the
 * bound fails LOUDLY (throws, which aborts the whole run with this message) rather than letting
 * the first cell eat the cost silently as a flake.
 *
 * THE BOUND is generous relative to the measured cold-start cost recorded in this suite's own
 * README.md (beside the `CELL_BUDGET` table) — a genuinely cold `/login` round trip measured
 * under 1 s on the host that measurement was taken on; 100 s leaves an order of magnitude of
 * headroom for a slower or more loaded host without ever adding real wall-clock to a run that
 * does not need it.
 */
const READY_TIMEOUT_MS = 100_000;
const POLL_INTERVAL_MS = 250;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (typeof baseURL !== "string" || baseURL === "") {
    throw new Error("#804 readiness gate: no project baseURL is configured to poll");
  }

  const context = await request.newContext({ ignoreHTTPSErrors: true });
  const startedAt = Date.now();
  try {
    for (;;) {
      try {
        const response = await context.get(`${baseURL}/login`, { timeout: 5_000 });
        if (response.ok()) {
          console.log(`[e2e] readiness gate: ${baseURL}/login answered after ${Date.now() - startedAt}ms`);
          return;
        }
      } catch {
        // Not up yet (connection refused, TLS handshake not ready, …) — keep polling.
      }
      if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
        throw new Error(
          `#804 readiness gate: ${baseURL}/login never answered within ${READY_TIMEOUT_MS}ms — `
          + "failing the run loudly rather than letting the walk suite's first sign-in absorb an "
          + "unbounded cold-start cost as an unexplained flake",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    await context.dispose();
  }
}
