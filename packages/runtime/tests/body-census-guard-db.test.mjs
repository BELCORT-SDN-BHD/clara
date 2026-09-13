// #637 review S5 — THE WORLD GUARD, against a REAL Postgres World.
//
// THE RULING THIS PROVES, and the measurement that produced it. The brief's original decision was
// warning-only and fail-open, following `checks.leader`. Building the two-build drill measured the
// alternative: an engine that boots against a non-terminal run whose body this image does not
// export re-enqueues it, the replay raises `ReplayDivergenceError`, and the crash-only supervisor
// exits 1 — which under Fly is a RESTART LOOP, not a park. A warning printed by a process that is
// about to die in a loop is not a reading anyone gets to act on, so the world lane became HARD:
//
//   · the census runs BEFORE `getWorld().start()` — after it is too late, because the boot
//     re-enqueue is the very thing that crashes;
//   · a stranded body REFUSES the world and RETURNS. It never exits: HTTP stays up so `/ready` and
//     `/api/build-info` remain readable, and NO lane runs;
//   · `/ready` is 503 with `checks.bodies.world_start_refused: true` and the bodies NAMED;
//   · `CLARA_ALLOW_STRANDED_BODIES=1` is the explicit operator override and restores the old
//     warning-only posture, visibly.
//
// WHY A SPAWNED PROCESS RATHER THAN A UNIT CELL. `tests/ready.test.mjs` pins the /ready arms and a
// source-shape cell pins the ORDER, but neither can boot a nitro plugin, and the claim under test
// is about what a real image does at boot against a real World. This file stages the one row that
// creates the condition, boots the built image twice, and reads what the process did.
//
// HARD-GATED like every other file in this suite that spawns a real world: a loopback host and a
// PGDATABASE in {clara_rt_test, clara_wave_b_ci}, with WORKFLOW_POSTGRES_URL parsed field by field
// against the PG* env this process is trusting. Everything else SKIPS — a skip is not evidence, so
// the reason is printed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as rig from "./rig.mjs";
import { ephemeralPort } from "./ephemeral-port.mjs";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
const serveScript = fileURLToPath(new URL("../scripts/serve.mjs", import.meta.url));
const bundle = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));

/** The same parsed-DSN gate the standalone e2es use: every field of WORKFLOW_POSTGRES_URL must
 *  independently agree with the PG* env, never merely "look like" a loopback URL. */
function worldDsnAgrees() {
  if (!process.env.WORKFLOW_POSTGRES_URL) return false;
  try {
    const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
    return (
      u.protocol === "postgres:"
      && LOCAL_HOSTS.has(u.hostname)
      && u.port === String(process.env.PGPORT ?? "")
      && u.pathname === "/" + (process.env.PGDATABASE ?? "")
      && [...u.searchParams.keys()].length === 0
    );
  } catch {
    return false;
  }
}

function gateReason() {
  if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
    return "needs a loopback PGHOST and PGDATABASE in {clara_rt_test, clara_wave_b_ci} (it boots a REAL world)";
  }
  if (!worldDsnAgrees()) return "needs WORKFLOW_POSTGRES_URL agreeing field-by-field with the PG* env";
  if (!existsSync(bundle)) return "needs a built runtime: pnpm --filter @clara/runtime build";
  return null;
}

const GATE = gateReason();
const READY = GATE === null && (await rig.runtimeReady());
const skip = GATE ?? (READY ? false : "the 0006 runtime surface is absent from this database");
if (skip) console.log(`[637.s5] SKIPPING the world-guard cells — ${skip}`);

/** A body identifier NO image exports and none ever will: the condition a rollback creates,
 *  staged directly, because the preflight reads rows and not engines. */
const GHOST = "claraWork_v99";
const ghostName = `workflow//./workflows/claraWork.v99//${GHOST}`;

async function stageGhostRun() {
  const id = `wrun_s5_${randomUUID().replace(/-/g, "")}`;
  await rig.rootQuery(
    "insert into workflow.workflow_runs (id, deployment_id, status, name) values ($1,$2,$3::workflow.status,$4)",
    [id, "s5-guard-test", "running", ghostName],
  );
  return id;
}

/** Never a DELETE first: once a world has touched a run, its event rows reference it. Cancel is the
 *  honest retirement and leaves the WDK's own log intact; the delete is a best-effort tidy after. */
async function retireRun(id) {
  await rig
    .rootQuery("update workflow.workflow_runs set status = 'cancelled'::workflow.status where id = $1", [id])
    .catch(() => {});
  await rig.rootQuery("delete from workflow.workflow_runs where id = $1", [id]).catch(() => {});
}

function spawnImage(port, extraEnv) {
  const env = Object.assign({}, process.env, {
    PORT: String(port),
    RELAY_TEST_MODE: "1",
    CLARA_START_WORLD: "1",
    WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
    SUPABASE_JWT_ISSUER: "https://clara-s5.test/auth/v1",
    SUPABASE_JWT_AUD: "authenticated",
    SUPABASE_JWT_SECRET: `s5-${randomUUID().replace(/-/g, "")}`,
    // Far past the window: no reconciler belt may re-enqueue anything mid-cell.
    CLARA_RECONCILE_GRACE: "30 minutes",
  }, extraEnv);
  delete env.CLARA_WORK_TEST_FAULT;
  const child = spawn(process.execPath, [serveScript], { env, stdio: ["ignore", "pipe", "pipe"] });
  const state = { out: "", err: "", exited: false, exitInfo: null };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (d) => { state.out += d; });
  child.stderr.on("data", (d) => { state.err += d; });
  child.on("exit", (code, signal) => { state.exited = true; state.exitInfo = { code, signal }; });
  return { child, state, port, log: () => state.out + state.err };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, { deadlineMs = 90000, label }) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function getJson(port, path) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(10000) });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

async function stop(image) {
  if (image.state.exited) return;
  image.child.kill("SIGTERM");
  const end = Date.now() + 30000;
  while (!image.state.exited && Date.now() < end) await sleep(200);
  if (!image.state.exited) image.child.kill("SIGKILL");
}

test("637.s5: a parked run of a body this image does not export REFUSES the world, keeps HTTP up, and NAMES it on /ready", { skip }, async () => {
  const runId = await stageGhostRun();
  const image = spawnImage(await ephemeralPort());
  try {
    // HTTP comes up even though the world is refused — that is the whole design: an operator must
    // be able to READ why. (/health is the liveness probe; /ready is the readiness verdict.)
    await waitFor(async () => (await getJson(image.port, "/health")).status === 200, { label: "/health 200 on a refused image" });

    const ready = await getJson(image.port, "/ready");
    assert.equal(ready.status, 503, `a refused world is NOT ready (got ${ready.status})`);
    assert.equal(ready.body.ready, false);
    assert.equal(ready.body.checks.bodies.world_start_refused, true, "the refusal is a FACT this process recorded about itself");
    assert.equal(ready.body.checks.bodies.measured, true, "…and the census was measured, not merely absent");
    assert.ok(ready.body.checks.bodies.stranded >= 1, `stranded counts the parked runs; got ${ready.body.checks.bodies.stranded}`);
    assert.ok(
      ready.body.checks.bodies.names.includes(GHOST),
      `/ready NAMES the stranded body — a bare count sends the reader back to the logs this field replaces; got ${JSON.stringify(ready.body.checks.bodies.names)}`,
    );
    assert.ok(
      ready.body.warnings.some((w) => w.includes(GHOST) && /refus/i.test(w)),
      `the warning names the body and says the world was refused; got ${JSON.stringify(ready.body.warnings)}`,
    );
    // /ready is unauthenticated: a body identifier is a public fact about the image, a DSN is not.
    assert.equal(JSON.stringify(ready.body).includes("postgres://"), false, "no DSN on an unauthenticated surface");

    const log = image.log();
    assert.match(log, /REFUSING TO START THE DURABLE WORLD/, "the boot log says so, loudly");
    assert.match(log, new RegExp(`names=[^\\n]*${GHOST}`), "…and names the body in the log line too");
    assert.equal(/durable world started pid=/.test(log), false, "the world was never started");
    assert.match(log, /\[clara-runtime\] serving git_sha=/, "the provenance line is emitted FIRST — before anything can refuse");

    // ALIVE. The refusal returns; it must never exit, because exiting is the restart loop this
    // change removes.
    assert.equal(image.state.exited, false, `the process is still serving (exit: ${JSON.stringify(image.state.exitInfo)})`);
    await sleep(1500);
    assert.equal(image.state.exited, false, "…and still serving a second and a half later — no crash loop");
  } finally {
    await stop(image);
    await retireRun(runId);
  }
});

test("637.s5: CLARA_ALLOW_STRANDED_BODIES=1 is the operator override — the same condition WARNS and the world is started", { skip }, async () => {
  const runId = await stageGhostRun();
  const image = spawnImage(await ephemeralPort(), { CLARA_ALLOW_STRANDED_BODIES: "1" });
  try {
    await waitFor(
      async () => /OVERRIDDEN by CLARA_ALLOW_STRANDED_BODIES=1/.test(image.log()) || image.state.exited,
      { label: "the override warning (or an early exit)" },
    );
    const log = image.log();
    assert.match(log, /stranded bodies n=\d+ names=[^\n]*claraWork_v99/, "the census still ran and still names the body");
    assert.match(log, /OVERRIDDEN by CLARA_ALLOW_STRANDED_BODIES=1/, "…and says the operator overrode it");
    assert.equal(/REFUSING TO START THE DURABLE WORLD/.test(log), false, "the override means NO refusal");

    // THE PROPERTY: the guard did not stop the boot. What happens next is the measured hazard the
    // guard exists for — the engine may re-enqueue the parked run and die on replay — so this cell
    // asserts that the process PROCEEDED to the world start, not that it survived it.
    await waitFor(
      async () => /durable world (started pid=|FAILED to start)/.test(image.log()) || image.state.exited,
      { label: "the world-start attempt" },
    );
    const after = image.log();
    const started = /durable world started pid=/.test(after);
    const crashed = /durable world FAILED to start/.test(after) || /ReplayDivergenceError/.test(after);
    assert.ok(started || crashed, `the process went on to START the world (got neither outcome in: ${after.slice(-800)})`);
    console.log(
      `[637.s5] override leg: world ${started ? "STARTED" : "start FAILED"}${crashed ? " (replay divergence / crash — the measured hazard the refusal prevents)" : ""}`
        + `; exited=${image.state.exited} ${JSON.stringify(image.state.exitInfo)}`,
    );

    if (!image.state.exited) {
      const ready = await getJson(image.port, "/ready");
      if (ready.status !== 0) {
        assert.equal(ready.body.checks.bodies.world_start_refused, false, "an OVERRIDDEN census is not a refusal");
        assert.ok(ready.body.checks.bodies.stranded >= 1, "…but it is still reported, as a warning");
        assert.ok(ready.body.warnings.some((w) => w.includes(GHOST)), "…and still names the body");
      }
    }
  } finally {
    await stop(image);
    await retireRun(runId);
  }
});

test("637.s5: with NO stranded body the same image starts the world and reports a silent green", { skip }, async () => {
  // The control. Without it the two cells above prove only that something refuses, not that the
  // stranded row is what does it.
  const image = spawnImage(await ephemeralPort());
  try {
    await waitFor(async () => (await getJson(image.port, "/ready")).status === 200, { label: "/ready 200 on a clean estate" });
    const log = image.log();
    assert.match(log, /stranded bodies n=0/, "the census ran and found nothing stranded");
    assert.match(log, /durable world started pid=/, "…and the world started");
    const ready = await getJson(image.port, "/ready");
    assert.equal(ready.body.checks.bodies.world_start_refused, false);
    assert.equal(ready.body.checks.bodies.stranded, 0);
    assert.equal(ready.body.checks.bodies.measured, true, "a measured zero, not an absent one");
    // SILENT, and the predicate has to be precise: `/ready` carries unrelated `stranded` counters
    // for the task lanes (a row wedged in `running` past its lane's threshold), which is a
    // different fact from a stranded BODY. A measured zero adds nothing of its own.
    assert.equal(
      ready.body.warnings.some((w) => /stranded-body|does NOT export|REFUSED at boot/.test(w)),
      false,
      `a measured zero is SILENT — no body warning at all; got ${JSON.stringify(ready.body.warnings)}`,
    );
  } finally {
    await stop(image);
  }
});

test("637.s5: teardown", { skip }, async () => {
  await rig.rootQuery("delete from workflow.workflow_runs where name = $1", [ghostName]).catch(() => {});
  await rig.endPool();
});
