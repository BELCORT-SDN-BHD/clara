#!/usr/bin/env node
// run-live-walk.mjs — the FS-5 裁-86 live-behavior ceremony for
// interview-walk.spec.ts, and the recipe FS-11's sixteen-step Wave-G walk is
// meant to lift directly (real browser -> real web app -> real runtime +
// Postgres + a REST read path + JWT fixtures).
//
// PRECONDITION (run separately, not by this script): a throwaway Postgres is
// already up, migrated, and seeded, matching
// packages/runtime/tests/interview-e2e.mjs's own documented local recipe:
//
//   docker run -d --name fs5-interview-rig -e POSTGRES_USER=postgres \
//     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clara_rt_test \
//     -p 127.0.0.1:55440:5432 postgres:17
//   PGHOST=127.0.0.1 PGPORT=55440 PGUSER=postgres PGPASSWORD=postgres \
//     PGDATABASE=clara_rt_test CLARA_ALLOW_DESTRUCTIVE=1 \
//     pnpm --filter @clara/db migrate
//   PGHOST=127.0.0.1 PGPORT=55440 PGUSER=postgres PGPASSWORD=postgres \
//     PGDATABASE=clara_rt_test CLARA_ALLOW_DESTRUCTIVE=1 \
//     pnpm --filter @clara/db seed
//
// DSN discipline (hard constraint 4 — never a credential in code, DSNs from
// the environment only): this script never constructs a connection string
// from parts. It REQUIRES one DSN as an input env var, exactly the way
// interview-e2e.mjs requires WORKFLOW_POSTGRES_URL rather than building one:
//   WORKFLOW_POSTGRES_URL — the rig's own DSN, used by BOTH the runtime
//   (imported in-process, same Node) and PostgREST (run with
//   `--network host`, so its own "localhost" IS this host's loopback —
//   the same one WORKFLOW_POSTGRES_URL already points at, no separate DSN
//   or `host.docker.internal`/gateway mapping needed). `--network host`
//   only works because this host's docker is genuine Linux-in-WSL2, not
//   Docker Desktop's Hyper-V VM — a future port of this ceremony to a host
//   where that is not true will need the bridge-network form back
//   (publish the rig's port on 0.0.0.0, not 127.0.0.1, and pass PostgREST
//   the loopback-mapped DSN via `host.docker.internal:host-gateway`).
//
// WHAT THIS SCRIPT DOES, IN ORDER:
//   1. Bootstraps the WDK world schema on that same database (the idempotent
//      `bootstrap` bin — the SAME one CI's db-live-gates action runs).
//   2. Starts a REAL PostgREST container against the SAME database — genuine
//      RLS enforcement, not a hand-rolled stand-in (verified against
//      clara.jwt_sub(), packages/db/migrations/0002_foundation.sql:337-343,
//      which reads PostgREST's own `request.jwt.claims` GUC directly, no
//      Supabase `auth` schema dependency).
//
//      CAVEAT, READ BEFORE LIFTING THIS FOR FS-11: the DSN this script asks
//      for is expected to authenticate as the rig's postgres SUPERUSER, so
//      PostgREST's `SET ROLE <jwt role claim>` needs no prior role-membership
//      grant. That is HARNESS-GRADE ONLY — production PostgREST connects as
//      a narrow `authenticator` role granted membership in exactly the roles
//      it may switch to. The superuser connection does NOT weaken what is
//      being proven: every query still executes AFTER `SET ROLE`, under the
//      TARGET role's own RLS — the walk's evidence is genuine. Do not copy
//      the superuser DSN into anything durable; a real deployment (or a more
//      faithful future harness) should provision a real `authenticator`
//      login the same way deploy/roles-bootstrap.sql provisions the rest.
//   3. Boots the real @clara/runtime server IN-PROCESS (the same
//      RELAY_TEST_MODE=1 / CLARA_START_WORLD=1 pattern
//      packages/runtime/tests/interview-e2e.mjs already uses), sharing one
//      JWT secret + issuer + audience with PostgREST.
//   4. Creates three real fixtures via packages/runtime/tests/rig.mjs's
//      already-exported, already-tested helpers (buildFirm,
//      beginClientOnboarding, createChatSession) — COMPLETE / CANCEL / RACE —
//      one client + open onboarding plan + chat thread each, all owned by
//      the same firm/owner (sufficient for every arm interview-walk.spec.ts
//      drives; the RACE arm's two browser CONTEXTS share one session on
//      purpose — the property under test is the SERVER's park-token
//      disambiguation, not caller identity).
//   5. Spawns `playwright test -c e2e/live-stack/playwright.live.config.ts`
//      with every env var the fixtures above produced, so serve-live.mjs
//      (Playwright's own webServer child) and interview-walk.spec.ts both
//      inherit them.
//   6. Tears down the PostgREST container and exits — the runtime and
//      Playwright's own webServer die with this process.
//
// Nothing here is destructive to any shared/live estate: the runtime DSN is
// gated below by interview-e2e.mjs's own regex (clara_(rt_test|wave_b_ci)),
// mirrored here for the same reason — refuses anything else.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SignJWT } from "jose";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "..");
const REPO_ROOT = resolve(WEB_ROOT, "..", "..");
const RUNTIME_ROOT = resolve(REPO_ROOT, "packages", "runtime");

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`run-live-walk.mjs: ${name} is required (never constructed in code — set it in the environment)`);
  return v;
}

const WORKFLOW_URL = required("WORKFLOW_POSTGRES_URL");
{
  const u = new URL(WORKFLOW_URL);
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
  const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
  const db = u.pathname.replace(/^\//, "");
  if (!LOCAL_HOSTS.has(u.hostname) || !ALLOWED_DB.test(db)) {
    throw new Error("run-live-walk.mjs is hard-gated to a loopback WORKFLOW_POSTGRES_URL naming clara_rt_test or clara_wave_b_ci — refusing any other target");
  }
}

function run(cmd, args, opts = {}) {
  // shell:true — on Windows, spawnSync(cmd, args) without a shell cannot
  // resolve a .cmd/.ps1 shim (pnpm, docker) and fails silently with
  // status:null and no output; POSIX is unaffected either way.
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status} (signal ${r.signal})`);
}

// This host's `docker` lives inside a WSL2 distro, not on the Windows PATH —
// every docker invocation goes through `wsl -d Ubuntu -- docker ...` on
// win32. A `wsl` hop does NOT forward the calling process's environment
// (only vars explicitly listed in WSLENV cross), so every value docker
// needs is passed as an explicit `KEY=value` argv entry here — never via
// the `env` option, which would silently be invisible on the Linux side.
const DOCKER_PREFIX = process.platform === "win32" ? ["wsl", "-d", "Ubuntu", "--", "docker"] : ["docker"];
function docker(args, opts = {}) {
  const [cmd, ...prefixArgs] = DOCKER_PREFIX;
  run(cmd, [...prefixArgs, ...args], opts);
}
function dockerBestEffort(args) {
  const [cmd, ...prefixArgs] = DOCKER_PREFIX;
  spawnSync(cmd, [...prefixArgs, ...args], { stdio: "ignore", shell: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(url, deadlineMs = 30_000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`${url} did not become healthy within ${deadlineMs}ms`);
}

// Mutable across main()/the catch handler so the runtime child can be
// killed on every exit path — a plain module-scope object, not a `let`,
// so main() can write into it before returning and the catch handler
// (unable to see main()'s own locals) still reads the same reference.
const runtimeChildRef = { current: null };

async function main() {
  console.log("[run-live-walk] 1/6 bootstrapping the WDK world schema");
  run("pnpm", ["--filter", "@clara/runtime", "exec", "bootstrap"], {
    cwd: REPO_ROOT,
    env: { ...process.env, WORKFLOW_POSTGRES_URL: WORKFLOW_URL },
  });

  console.log("[run-live-walk] 2/6 building the runtime bundle (nitro)");
  run("pnpm", ["--filter", "@clara/runtime", "build"], { cwd: REPO_ROOT });

  const JWT_ISSUER = "https://clara-interview.live-e2e.test/auth/v1";
  const JWT_AUD = "authenticated";
  const JWT_AUTH_ROLE = "clara_authenticated";
  const JWT_SECRET = "live-e2e-" + randomUUID().replace(/-/g, "");

  console.log("[run-live-walk] 3/6 starting PostgREST against the rig (harness-grade superuser DSN — see this file's own header)");
  const postgrestPort = 55441;
  dockerBestEffort(["rm", "-f", "fs5-live-postgrest"]);
  // --network host: this host's docker is genuine Linux-in-WSL2 (not Docker
  // Desktop's Hyper-V VM), so PostgREST's own network namespace IS this
  // host's — WORKFLOW_URL's loopback address reaches the rig directly, no
  // bridge/gateway hop and no separate DSN. See this file's header.
  // WORKFLOW_URL is deliberately password-less in the DSN text itself
  // (matching this repo's own libpq-fallback convention — pg/libpq reads
  // PGPASSWORD when the DSN omits one). The `wsl -d Ubuntu --` hop does not
  // forward this process's environment, so PGPASSWORD (if the caller set
  // one — a trust-auth rig has none) is forwarded explicitly, by value,
  // exactly once, here.
  const postgrestEnv = [
    "-e", `PGRST_DB_URI=${WORKFLOW_URL}`,
    "-e", "PGRST_DB_SCHEMAS=clara",
    "-e", "PGRST_DB_ANON_ROLE=clara_authenticated",
    "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "-e", `PGRST_SERVER_PORT=${postgrestPort}`,
  ];
  if (process.env.PGPASSWORD) postgrestEnv.push("-e", `PGPASSWORD=${process.env.PGPASSWORD}`);
  docker([
    "run", "-d", "--name", "fs5-live-postgrest", "--network", "host",
    ...postgrestEnv,
    "postgrest/postgrest",
  ]);
  const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;
  await waitHealthy(postgrestUrl);
  console.log("[run-live-walk] PostgREST healthy at", postgrestUrl);

  console.log("[run-live-walk] 4/6 booting the runtime as a child process");
  // A genuine child process with cwd:RUNTIME_ROOT — NOT a dynamic import()
  // of the bundled server from this script's own (apps/web) cwd. The nitro
  // output's bundled @workflow/core does its own internal `require()` of
  // @workflow/world-postgres keyed off the PROCESS ENTRY POINT's location
  // (interview-e2e.mjs never hits this because it physically lives, and
  // runs, under packages/runtime/tests/ — this script does not), so an
  // import() from here resolves that bare specifier against apps/web's own
  // node_modules and fails. Spawning it exactly the way it is meant to run
  // (`node .output/server/index.mjs`, cwd = packages/runtime) sidesteps the
  // whole class of interop quirk rather than chasing it further.
  const runtimeChild = spawn(process.execPath, [resolve(RUNTIME_ROOT, ".output", "server", "index.mjs")], {
    cwd: RUNTIME_ROOT,
    env: {
      ...process.env,
      RELAY_TEST_MODE: "1",
      CLARA_START_WORLD: "1",
      WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
      WORKFLOW_POSTGRES_URL: WORKFLOW_URL,
      PORT: "3200",
      SUPABASE_JWT_ISSUER: JWT_ISSUER,
      SUPABASE_JWT_AUD: JWT_AUD,
      SUPABASE_JWT_SECRET: JWT_SECRET,
      SUPABASE_JWT_AUTH_ROLE: JWT_AUTH_ROLE,
    },
    stdio: "inherit",
  });
  runtimeChildRef.current = runtimeChild;
  await waitHealthy("http://127.0.0.1:3200/health");
  console.log("[run-live-walk] runtime healthy on :3200");

  console.log("[run-live-walk] 5/6 creating the three fixtures (COMPLETE / CANCEL / RACE)");
  const rig = await import(pathToFileURL(resolve(RUNTIME_ROOT, "tests", "rig.mjs")).href);
  const { owner } = await rig.buildFirm("fs5-live");
  const fixtures = {};
  for (const name of ["COMPLETE", "CANCEL", "RACE"]) {
    const { clientId, planId } = await rig.beginClientOnboarding({ ownerSub: owner, name: `fs5-live-${name.toLowerCase()}-${Date.now()}` });
    // createChatSession resolves the session id directly (a bare string),
    // not {id: ...} — rig.mjs:98-105's own `returning id` + `.rows[0].id`.
    const threadId = await rig.createChatSession({ author: owner, client: clientId, visibility: "private", title: `FS-5 live walk (${name})` });
    fixtures[name] = { clientId, planId, threadId };
    console.log(`[run-live-walk]   ${name}: client=${clientId} plan=${planId} thread=${threadId}`);
  }
  console.log(`[run-live-walk]   owner sub=${owner} — serve-live.mjs mints per-browser-session tokens against the shared secret, no token minted here`);
  const key = new TextEncoder().encode(JWT_SECRET); // asserts jose + the secret can mint at all before the browser needs it
  await new SignJWT({ role: JWT_AUTH_ROLE }).setProtectedHeader({ alg: "HS256" }).setSubject(owner)
    .setIssuer(JWT_ISSUER).setAudience(JWT_AUD).setIssuedAt().setExpirationTime("1m").sign(key);

  console.log("[run-live-walk] 6/6 running Playwright against the live stack");
  const playwrightEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:3100/e2e-supabase",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_clara_e2e_only",
    CLARA_RUNTIME_URL: "http://127.0.0.1:3200",
    CLARA_PUBLIC_ORIGINS: "https://127.0.0.1:3100",
    CLARA_E2E_APP_ORIGIN: "https://127.0.0.1:3100",
    CLARA_E2E_JWT_SECRET: JWT_SECRET,
    CLARA_E2E_JWT_ISSUER: JWT_ISSUER,
    CLARA_E2E_JWT_AUD: JWT_AUD,
    CLARA_E2E_JWT_AUTH_ROLE: JWT_AUTH_ROLE,
    CLARA_E2E_OWNER_SUB: owner,
    CLARA_E2E_POSTGREST_URL: postgrestUrl,
    CLARA_E2E_INTERVIEW_COMPLETE_CLIENT_ID: fixtures.COMPLETE.clientId,
    CLARA_E2E_INTERVIEW_COMPLETE_THREAD_ID: fixtures.COMPLETE.threadId,
    CLARA_E2E_INTERVIEW_CANCEL_CLIENT_ID: fixtures.CANCEL.clientId,
    CLARA_E2E_INTERVIEW_CANCEL_THREAD_ID: fixtures.CANCEL.threadId,
    CLARA_E2E_INTERVIEW_RACE_CLIENT_ID: fixtures.RACE.clientId,
    CLARA_E2E_INTERVIEW_RACE_THREAD_ID: fixtures.RACE.threadId,
  };

  const pw = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "e2e/live-stack/playwright.live.config.ts"], {
    cwd: WEB_ROOT,
    env: playwrightEnv,
    stdio: "inherit",
    shell: true,
  });

  console.log("[run-live-walk] tearing down PostgREST and the runtime");
  dockerBestEffort(["rm", "-f", "fs5-live-postgrest"]);
  runtimeChildRef.current?.kill("SIGTERM");

  process.exit(pw.status ?? 1);
}

main().catch((err) => {
  console.error("[run-live-walk] FATAL:", err?.stack ?? err);
  dockerBestEffort(["rm", "-f", "fs5-live-postgrest"]);
  runtimeChildRef.current?.kill("SIGTERM");
  process.exit(1);
});
