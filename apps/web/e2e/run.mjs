import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "../..");
const appOrigin = "https://127.0.0.1:3100";
const env = {
  ...process.env,
  CLARA_E2E_APP_ORIGIN: appOrigin,
  CLARA_PUBLIC_ORIGINS: appOrigin,
  NEXT_PUBLIC_SUPABASE_URL: `${appOrigin}/e2e-supabase`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_clara_e2e_only",
  CLARA_E2E_ROUTE_ERROR_PROBE: "1",
  // FS-4 C-6 Lane B. The confirm wall now reaches C-5's ONE runtime endpoint
  // rather than a stub, so the walk points CLARA_RUNTIME_URL at the mock's own
  // prefix (it serves /api/auth-wall/confirm there) and flips the gate the
  // Lane-A skeleton left for exactly this moment.
  CLARA_RUNTIME_URL: `${appOrigin}/e2e-supabase`,
  CLARA_AUTH_WALL_SERVICE_TOKEN: "e2e-auth-wall-service-token",
  CLARA_E2E_CONFIRM_WALL_WIRED: "1",
  // POST /checkout's own two inputs. The pepper and the header name are what
  // make the trusted-IP courier produce a digest at all; absent, the route
  // refuses (design part 3 §3) — which is a real arm the walk also drives.
  CLARA_RATE_WALL_PEPPER: "e2e-rate-wall-pepper",
  CLARA_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
  // STRIPE_SECRET_KEY IS DELIBERATELY ABSENT. With no base override (see
  // lib/checkout/stripe-session.ts for why there is none), a key here would
  // send a real outbound request to api.stripe.com from every test run — slow,
  // offline-fragile, and a bogus Authorization header posted to a third party.
  // Absent, the seam refuses `unconfigured` BEFORE any network call, which is
  // itself one of the design's own fail-closed arms (part 3 §3), and the
  // walk asserts the honest card and the unstamped intent that follow.
};
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("pnpm CLI path is absent; run this harness through the package e2e script");
}

function run(args) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[e2e] building @clara/web before starting the browser walk");
run(["--filter", "@clara/web", "build"]);
console.log("[e2e] starting next start and Playwright against the built app");
run(["--filter", "@clara/web", "exec", "playwright", "test"]);
