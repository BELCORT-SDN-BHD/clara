import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "../..");
// Both ports are overridable so two lanes can run this harness at once — the
// sprint assigns each lane its own range, and the literals below were what made
// the second one fail to bind. Defaults are the historical values, so a plain
// `pnpm --filter @clara/web e2e` is byte-for-byte the run it always was.
// `serve-built.mjs` reads CLARA_E2E_NEXT_PORT itself; it is passed through here
// only so an explicit setting survives this script's own env rebuild.
const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
const nextPort = process.env.CLARA_E2E_NEXT_PORT ?? "3101";
const env = {
  ...process.env,
  CLARA_E2E_APP_ORIGIN: appOrigin,
  CLARA_E2E_NEXT_PORT: nextPort,
  CLARA_PUBLIC_ORIGINS: appOrigin,
  CLARA_E2E_MONEY_INPUT_HARNESS: "1",
  NEXT_PUBLIC_SUPABASE_URL: `${appOrigin}/e2e-supabase`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_clara_e2e_only",
  CLARA_E2E_ROUTE_ERROR_PROBE: "1",
  // FS-4 C-6 Lane B. The confirm wall reaches C-5's ONE runtime endpoint rather
  // than a stub, and the gate the Lane-A skeleton left for exactly this moment
  // is flipped below.
  //
  // CLARA_RUNTIME_URL IS DELIBERATELY NOT SET HERE. `serve-built.mjs` owns it
  // for the `next start` child, pointing it at the ONE mock runtime, and FS-4's
  // auth-wall endpoint is delegated into that same runtime. Setting it here as
  // well was a second, losing claim on one variable: merging `origin/main`
  // silently took its override and every confirmation answered `unavailable`.
  // No conflict marker, no red unit test — only the browser leg saw it.
  CLARA_AUTH_WALL_SERVICE_TOKEN: "e2e-auth-wall-service-token",
  CLARA_E2E_CONFIRM_WALL_WIRED: "1",
  // POST /checkout's own two inputs. The pepper and the header name are what
  // make the trusted-IP courier produce a digest at all; absent, the route
  // refuses (design part 3 §3). THAT ARM IS A UNIT CELL, NOT A WALK ARM —
  // `tests/checkout-route.test.ts`'s "FAIL CLOSED" case drives all four
  // absent-input shapes. An earlier comment here claimed the walk drove it too;
  // no spec mentions the digest-absent card.
  CLARA_RATE_WALL_PEPPER: "e2e-rate-wall-pepper",
  // NOT `x-forwarded-for`: Next 16.3.3 synthesizes that one from the socket
  // (`base-server.js`, `??=`), so it is always present and the route's
  // fail-closed arm could never be reached in a walk — the green would have
  // meant less than it looked. This name is single-valued, set by the browser
  // context in `playwright.config.ts`, and filled in by nothing else, so the
  // walk drives BOTH the present and the absent arm.
  CLARA_TRUSTED_CLIENT_IP_HEADER: "x-clara-e2e-client-ip",
  // STRIPE_SECRET_KEY IS DELIBERATELY ABSENT. With no base override (see
  // lib/checkout/stripe-session.ts for why there is none), a key here would
  // send a real outbound request to api.stripe.com from every test run — slow,
  // offline-fragile, and a bogus Authorization header posted to a third party.
  // Absent, the seam refuses `unconfigured` BEFORE any network call, which is
  // itself one of the design's own fail-closed arms (part 3 §3), and the
  // walk asserts the honest card and the unstamped intent that follow.
  //
  // CLARA_STRIPE_LIVEMODE IS ABSENT FOR THE SAME REASON, and its absence is
  // not an oversight to "fix". The key-class gate (CB-AE2E-003) runs AFTER the
  // absent-key check, so with no key at all the walk still reaches the same
  // `unconfigured` refusal it always did and the card it asserts is unchanged.
  // Setting the mode here would prove nothing the unit cells in
  // `lib/checkout/stripe-session.test.ts` do not prove better: every arm of
  // that gate is driven there, including both refusal directions, because
  // reaching them in a browser would need a real key in the harness.
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
