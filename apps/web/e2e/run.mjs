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
  NEXT_PUBLIC_SUPABASE_URL: `${appOrigin}/e2e-supabase`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_clara_e2e_only",
  CLARA_E2E_ROUTE_ERROR_PROBE: "1",
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
