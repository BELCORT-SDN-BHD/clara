#!/usr/bin/env node
// run-reports-download-walk.mjs — the FS-7 echelon 2 (裁-96②) live-behavior ceremony for
// reports-download-walk.spec.ts, and a deliberate sibling of run-live-walk.mjs rather than a
// widening of it: the two walks need different fixtures, and one script that provisioned both
// would make either walk's missing env silently skip the other's spec.
//
// Everything structural is lifted verbatim from run-live-walk.mjs — the DSN gate, the WSL docker
// hop, the PostgREST container, the in-process runtime boot, the shared JWT secret. Read that
// file's header for why each is shaped the way it is; only the differences are explained here.
//
// THE ONE REAL DIFFERENCE: the runtime is booted with CLARA_TEST_STORAGE_DIR pointing at a
// throwaway directory, and this script writes the artifact's bytes into it AT THEIR CONTENT
// ADDRESS. That is not a stub — RELAY_TEST_MODE puts packages/runtime/lib/storage.mjs on its local
// content-addressed path, which runs the SAME safeArtifactKey validator and the SAME hash-en-route
// verification the Supabase path runs. What is mocked is the object STORE, never the door, the
// route, the gate or the browser.
//
// PRECONDITION (run separately): a throwaway Postgres, migrated and seeded, named clara_rt_test or
// clara_wave_b_ci — the same gate run-live-walk.mjs enforces, mirrored here for the same reason.
// The migration chain MUST include this lane's own download-door migration; the fixture step below
// probes for the door by exact signature and refuses rather than running a walk that would skip.
//
//   node apps/web/e2e/live-stack/run-reports-download-walk.mjs

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "..");
const REPO_ROOT = resolve(WEB_ROOT, "..", "..");
const RUNTIME_ROOT = resolve(REPO_ROOT, "packages", "runtime");

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`run-reports-download-walk.mjs: ${name} is required (never constructed in code — set it in the environment)`);
  return v;
}

const WORKFLOW_URL = required("WORKFLOW_POSTGRES_URL");
{
  const u = new URL(WORKFLOW_URL);
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
  const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
  const db = u.pathname.replace(/^\//, "");
  if (!LOCAL_HOSTS.has(u.hostname) || !ALLOWED_DB.test(db)) {
    throw new Error("hard-gated to a loopback WORKFLOW_POSTGRES_URL naming clara_rt_test or clara_wave_b_ci — refusing any other target");
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status} (signal ${r.signal})`);
}
const DOCKER_PREFIX = process.platform === "win32" ? ["wsl", "-d", "Ubuntu", "--", "docker"] : ["docker"];
function docker(args) { const [c, ...p] = DOCKER_PREFIX; run(c, [...p, ...args]); }
function dockerBestEffort(args) { const [c, ...p] = DOCKER_PREFIX; spawnSync(c, [...p, ...args], { stdio: "ignore", shell: true }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(url, deadlineMs = 30_000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return; } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error(`${url} did not become healthy within ${deadlineMs}ms`);
}

const runtimeChildRef = { current: null };

async function main() {
  console.log("[reports-walk] 1/6 bootstrapping the WDK world schema");
  run("pnpm", ["--filter", "@clara/runtime", "exec", "bootstrap"],
    { cwd: REPO_ROOT, env: { ...process.env, WORKFLOW_POSTGRES_URL: WORKFLOW_URL } });

  console.log("[reports-walk] 2/6 building the runtime bundle (nitro)");
  run("pnpm", ["--filter", "@clara/runtime", "build"], { cwd: REPO_ROOT });

  const JWT_ISSUER = "https://clara-reports.live-e2e.test/auth/v1";
  const JWT_AUD = "authenticated";
  const JWT_AUTH_ROLE = "clara_authenticated";
  const JWT_SECRET = "live-e2e-" + randomUUID().replace(/-/g, "");
  const STORAGE_DIR = mkdtempSync(join(tmpdir(), "clara-e2e-store-"));

  console.log("[reports-walk] 3/6 starting PostgREST against the rig");
  const postgrestPort = 55451;
  dockerBestEffort(["rm", "-f", "fs7e2-live-postgrest"]);
  const postgrestEnv = [
    "-e", `PGRST_DB_URI=${WORKFLOW_URL}`,
    "-e", "PGRST_DB_SCHEMAS=clara",
    "-e", "PGRST_DB_ANON_ROLE=clara_authenticated",
    "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "-e", `PGRST_SERVER_PORT=${postgrestPort}`,
  ];
  if (process.env.PGPASSWORD) postgrestEnv.push("-e", `PGPASSWORD=${process.env.PGPASSWORD}`);
  docker(["run", "-d", "--name", "fs7e2-live-postgrest", "--network", "host", ...postgrestEnv, "postgrest/postgrest"]);
  const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;
  await waitHealthy(postgrestUrl);

  console.log("[reports-walk] 4/6 provisioning the Reports fixture");
  const rig = await import(pathToFileURL(resolve(RUNTIME_ROOT, "tests", "rig.mjs")).href);

  // THE DOOR MUST BE ON THIS CHAIN, BY EXACT SIGNATURE. Without this the walk would provision a
  // fixture, boot the whole stack and then SKIP — a green run that measured nothing.
  const door = await rig.rootQuery(
    `select to_regprocedure('clara.get_artifact_for_human_read(uuid,uuid)') is not null as byte,
            to_regprocedure('clara.list_downloadable_artifacts(uuid,int)') is not null as offer`);
  if (!door.rows[0].byte || !door.rows[0].offer) {
    throw new Error("the FS-7 e2 download door is not on this database — migrate the branch's chain before running this walk");
  }

  const { owner, firm, client } = await rig.buildFirm("fs7e2-live");

  /** One sandbox export under `firm`, optionally COMPLETE with its object on disk. */
  async function seedExport({ complete }) {
    const recipient = (await rig.humanQuery(owner,
      "select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["firm_member", owner, `fs7e2 live ${randomUUID().slice(0, 6)}`, "fs7 e2 live walk", null,
        rig.opk("fs7e2live")])).rows[0].r.recipient_id;
    const policy = (await rig.rootQuery(
      `select id from clara.watermark_policy_versions
        where policy_key='sandbox_watermark' and locale='en' and effective_to is null
          and btrim(coalesce(watermark ->> 'watermark','')) <> ''
        order by version desc limit 1`)).rows[0]?.id ?? null;
    if (!policy) throw new Error("no ratified sandbox watermark policy row on this rig");
    const view = (await rig.rootQuery(
      `insert into clara.sandbox_views(firm_id, body, body_sha256, client_set, client_set_basis,
         basis, acting_actor, model_snapshot, rationale)
       values ($1,$2::jsonb,$3,$4::uuid[],'exact','[]'::jsonb,$5,
         '{"provider":"anthropic","model":"claude-opus-5","version":"2026-08"}'::jsonb,'fs7 e2 live walk')
       returning id`,
      [firm, JSON.stringify({ blocks: [{ kind: "text", basis_ref: "a", displayed_text: "prose" }] }),
        createHash("sha256").update(randomUUID()).digest("hex"), [client], owner])).rows[0].id;

    if (!complete) {
      const id = (await rig.rootQuery(
        `insert into clara.sandbox_exports(firm_id, sandbox_view_id, recipient_id, coverage_proof,
           watermark_policy_version_id, locale, requested_by, op_key, state)
         values ($1,$2,$3,'{}'::jsonb,$4,'en',$5,$6,'claimable') returning id`,
        [firm, view, recipient, policy, owner, rig.opk("fs7e2liveexp")])).rows[0].id;
      return { id, sha: null, bytes: 0 };
    }

    // A REAL PDF at its REAL content address. Minimal but genuine: `%PDF-` magic, one page, an
    // EOF marker — enough that the browser's own content-type allow-list and the walk's magic-
    // number assertion are both meaningful.
    const body = Buffer.from(
      "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
      + "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
      + `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n`
      + `% fs7 e2 live walk ${randomUUID()}\n%%EOF\n`, "latin1");
    const sha = createHash("sha256").update(body).digest("hex");
    const key = `firms/${firm}/sandbox/${sha}.pdf`;
    const dest = join(STORAGE_DIR, ...key.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
    const id = (await rig.rootQuery(
      `insert into clara.sandbox_exports(firm_id, sandbox_view_id, recipient_id, coverage_proof,
         watermark_policy_version_id, locale, requested_by, op_key, state, artifact_sha256,
         byte_size, storage_key, claimed_by, claimed_at, lease_expires_at, finished_at)
       values ($1,$2,$3,'{}'::jsonb,$4,'en',$5,$6,'done',$7,$8,$9,'fs7e2-live',now(),
         now()+interval '20 minutes', now()) returning id`,
      [firm, view, recipient, policy, owner, rig.opk("fs7e2liveexp"), sha, body.length, key])).rows[0].id;
    return { id, sha, bytes: body.length };
  }

  const done = await seedExport({ complete: true });
  const pending = await seedExport({ complete: false });
  console.log(`[reports-walk]   client=${client} done=${done.id} sha=${done.sha.slice(0, 16)}… pending=${pending.id}`);
  console.log(`[reports-walk]   object store: ${STORAGE_DIR}`);

  console.log("[reports-walk] 5/6 booting the runtime as a child process");
  const runtimeChild = spawn(process.execPath, [resolve(RUNTIME_ROOT, ".output", "server", "index.mjs")], {
    cwd: RUNTIME_ROOT,
    env: {
      ...process.env,
      RELAY_TEST_MODE: "1",
      CLARA_START_WORLD: "1",
      WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
      WORKFLOW_POSTGRES_URL: WORKFLOW_URL,
      // The object store the download route reads through. Mocked STORE, real everything else.
      CLARA_TEST_STORAGE_DIR: STORAGE_DIR,
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

  console.log("[reports-walk] 6/6 running Playwright against the live stack");
  const pw = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "e2e/live-stack/playwright.reports.config.ts"], {
    cwd: WEB_ROOT,
    env: {
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
      CLARA_E2E_REPORTS_CLIENT_ID: client,
      CLARA_E2E_REPORTS_ARTIFACT_ID: done.id,
      CLARA_E2E_REPORTS_ARTIFACT_SHA256: done.sha,
      CLARA_E2E_REPORTS_ARTIFACT_BYTES: String(done.bytes),
      CLARA_E2E_REPORTS_PENDING_ARTIFACT_ID: pending.id,
    },
    stdio: "inherit",
    shell: true,
  });

  console.log("[reports-walk] tearing down PostgREST and the runtime");
  dockerBestEffort(["rm", "-f", "fs7e2-live-postgrest"]);
  runtimeChildRef.current?.kill("SIGTERM");
  process.exit(pw.status ?? 1);
}

main().catch((err) => {
  console.error("[reports-walk] FATAL:", err?.stack ?? err);
  dockerBestEffort(["rm", "-f", "fs7e2-live-postgrest"]);
  runtimeChildRef.current?.kill("SIGTERM");
  process.exit(1);
});
