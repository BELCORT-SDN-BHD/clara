// STANDALONE TWO-BUILD CUTOVER e2e (#637, AC2/AC3/AC4/AC5). NOT a `node --test` file: it BUILDS A
// SECOND IMAGE, spawns it, spawns this tree's own image after it, and drives one Work through each
// across a real Postgres World. Run:
//
//   PGHOST=127.0.0.1 PGPORT=55441 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55441/clara_rt_test \
//   RELAY_TEST_MODE=1 node tests/two-build-cutover-e2e.mjs
//
// WHY A SECOND BUILD AT ALL. `tests/version-cutover-e2e.mjs` proves a great deal about a cutover
// and it proves ALL of it inside ONE process: it references the retained body by its build-manifest
// workflowId and starts it explicitly, because a single image carries both. What it therefore
// cannot show is the thing a release actually does — that an image which DOES NOT CARRY the
// successor admitted the parked run, that a DIFFERENT image then admitted new Work to the
// successor, and that the first Work resumed on its original body inside the second image. That
// requires two artifacts, so this file builds one (tests/scratch-image.mjs states how, and why the
// copy may not live under packages/runtime).
//
// THE PAIR IS DERIVED, NEVER HARDCODED. `deriveVersionPair` reads registry.ts's live
// `claraWork: claraWork_vN` pin and its retained `export { claraWork_vM }` roster. The drill was
// written at v1 -> v2 and #631's `claraWork_v3` made it v2 -> v3.
//
// AND SO IS EVERYTHING ELSE ABOUT THE PAIR — the wave-3 correction, recorded because the earlier
// claim ("it becomes v2 -> v3 with no edit in this file") was measured FALSE on the first real
// re-run: the pair derived perfectly and the drill then failed on a hardcoded string. Two families
// of literal have been removed.
//   · THE BUNDLE IDS. `clara-work/vN` is a function of `claraWork_vN`, so it is computed from the
//     pair (`bundleIdOf`) rather than spelled.
//   · THE PARKING SHAPE. The pair IS asymmetric and that is still accepted rather than papered
//     over, but the asymmetry is a fact about VERSIONS, not about cutovers:
//       · claraWork_v1 parks a BARE clarify (`openInterruptionStep`, claraWork.v1.ts:141-142),
//         answered through `clara.answer_interruption`;
//       · claraWork_v2 and every successor park a typed WORK QUESTION (`openWorkQuestionStep`,
//         claraWork.v2.ts:176-183), answered through `clara.answer_work_question`.
//     `parksBareClarify(version)` is that rule, so a v2 -> v3 drill drives the typed door on BOTH
//     sides and a later v3 -> v4 will too.
// What the drill measures is NOT that the two park identically — at v1 -> v2 they do not — but that
// each run stays bound to the body it was admitted under, resumes into that body, and settles
// through its OWN receipt carrying that body's OWN bundle digest.
//
// ONE FIDELITY LIMIT, STATED BECAUSE IT IS REAL. Only `registry.ts` is rewritten in the scratch
// copy (the orchestrator's ruling, and the smallest rewrite that isolates the variable), so build A
// still IMPORTS and logs the successor's frozen BUNDLE-IDENTITY module — a constants file, not a
// runnable body. What makes A a genuine rollback target is asserted directly rather than assumed:
// its bundle carries NO WDK directive for the successor body, its `/api/build-info` neither pins
// nor lists it, and the Work it admits binds the predecessor.
//
// LEADER CONTENTION IS AVOIDED BY SEQUENCE, not by luck: A is stopped and its exit awaited BEFORE B
// is spawned. `CLARA_RECONCILE_GRACE` is lengthened far past the test window so B's reconciler can
// never re-enqueue A's parked Work onto the successor mid-drill (the version-cutover-e2e:92
// precedent).
//
// AND THAT SEQUENCE IS PRECISELY WHY `/ready` IS NOT THIS DRILL'S BOOT SIGNAL — the finding of its
// first execution on a Linux runner (GitHub run 34796679822). `/ready`'s world and control
// conjuncts are HEARTBEAT ROWS, and `clara.runtime_heartbeats` carries one row per component for
// the WHOLE ESTATE (0006 §2.8) inside a 30s staleness window (lib/health.mjs:50) — so a successor
// spawned onto the database its predecessor was beating into answers 200 on the PREDECESSOR's
// beats. lib/health.mjs names that window itself, where it refuses to infer a refused world start
// from a missing heartbeat: "a fresh beat from the previous process would otherwise mask it for a
// whole staleness window". This drill manufactures exactly that condition by construction — stop A,
// spawn B, same database, one second apart — so it waits for each image's OWN boot lines
// (`waitBooted`) on top of `/ready`, and never asserts a log line the process has not yet been
// given the chance to print.
//
// AND THE LAW IT MEASURES SURVIVED A REAL CUTOVER RATHER THAN A DRILLED ONE. The first v2 -> v3
// run of this file found that W1 — parked on the predecessor before build B ever served — could
// not POST inside build B: 0195's recut posting core requires a consumed `accounting_work` egress
// authorisation, and `prepare_work_egress_dispatch`/`consume_egress_dispatch` are called only from
// `claraWork.v3.impl.ts`, which a frozen predecessor can never gain. The drill was left RED and
// the finding went to the owner, because "a parked predecessor is expected to be refused" is a
// ruling, not a test's to make. The ruling came back the other way — a run claimed under a PRE-v3
// bundle is GRANDFATHERED past that wall (0195's header carries it verbatim, and
// docs/ARCHITECTURE.md §10) — so W1 RESUMES AND POSTS here, which is what this file always said a
// cutover means. The other half of that ruling is the frontier rule, and this drill asserts it
// too: once the database is at 0195, `rollback-preflight` REFUSES a target that does not carry
// `claraWork_v3`, with the Work lane fully drained and both censuses clean.
//
// WHAT IT DELIBERATELY DOES NOT ASSERT: a `(CLR13, work_cancelled)` classification. Nothing here
// cancels, and the frozen v1/v2 error tables map that pair to `state_changed` — asserting a
// "correct" classification in a drill that does not exercise it would be a claim about a table
// rather than about this cutover.
//
// IT HAS TWO DOORS, BOTH NAMED, BOTH BEFORE ANYTHING IS BUILT (#637 review S4).
//   · THE ARTIFACT GATE. This file runs `.output/server/index.mjs` as build B and scans it to prove
//     build A differs by exactly one body. A bundle that was never built, or that predates the
//     sources it claims to be, would let every assertion below pass about code nobody is shipping —
//     the worst outcome available to a drill. tests/built-bundle-gate.mjs is that refusal, with its
//     own unit cells.
//   · THE INVENTORY GATE, and it is not fussiness either — it is a MEASURED hazard. A first run of
//     this drill was interrupted mid-way and left a non-terminal successor run behind; on the next
//     run, build A booted, its engine re-enqueued a run whose body it does not export, and the
//     replay raised `ReplayDivergenceError`. The crash-only supervisor then exited 1. So the honest
//     reading of a rollback to a body-less image is stronger than the README's old "the lane
//     PARKS": the ENGINE can crash-loop — which is what made the boot census a REFUSAL rather than
//     a warning (#637 review S5), and why the preflight is a gate rather than a note. The gate runs
//     the preflight's OWN censuses over the whole database against this tree's artifact, because
//     this file later asserts GLOBAL verdicts and a global verdict only means something if the
//     estate started clean. Failing at the door with an instruction beats failing deep in a later
//     leg (the #708 posture).
//
// IT CLEANS UP AFTER ITSELF on every exit path: its own non-terminal tasks are cancelled and its
// own non-terminal runs are marked cancelled, so an interrupted run does not poison the next one.
//
// GATED. `CLARA_SKIP_WORK_E2E=1` opts out, and the file SKIPS CLEANLY (exit 0, printed reason) when
// migration 0180 is absent.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
import { buildPreviousVersionImage, removeScratchTree } from "./scratch-image.mjs";
import { RUNTIME_SOURCE_ROOTS, assertBuiltBundleFresh } from "./built-bundle-gate.mjs";
import {
  bodyIdentifierOf,
  frontierBodyViolations,
  preflight,
  readMigrationFrontier,
  supportedBodiesFromBundle,
} from "../lib/rollback-preflight.mjs";

if (process.env.CLARA_SKIP_WORK_E2E === "1") {
  console.log("[tb-e2e] skipped (CLARA_SKIP_WORK_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the work-question-e2e precedent, verbatim).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("two-build-cutover-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("two-build-cutover-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("two-build-cutover-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const ISSUER = "https://clara-two-build.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "tb-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const childScript = fileURLToPath(new URL("./two-build-serve.mjs", import.meta.url));
const runtimeServe = fileURLToPath(new URL("../scripts/serve.mjs", import.meta.url));
const runtimeBundle = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));
const FETCH_TIMEOUT_MS = 15000;

const WATCHDOG_MS = 15 * 60 * 1000;
setTimeout(() => {
  console.error(`\nTWO-BUILD CUTOVER E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

const mint = (sub) =>
  new SignJWT({ role: AUD })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("40m")
    .sign(key);

function childEnv(port, serveTarget) {
  const base = Object.assign({}, process.env, {
    PORT: String(port),
    RELAY_TEST_MODE: "1",
    CLARA_START_WORLD: "1",
    WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
    SUPABASE_JWT_ISSUER: ISSUER,
    SUPABASE_JWT_AUD: AUD,
    SUPABASE_JWT_SECRET: jwtSecret,
    CLARA_TWO_BUILD_SERVE: serveTarget,
    // Far past the test window: B's reconciler must never re-enqueue A's parked Work onto the
    // successor mid-drill (version-cutover-e2e:92's own reason, same knob).
    CLARA_RECONCILE_GRACE: "30 minutes",
  });
  delete base.CLARA_WORK_TEST_FAULT;
  delete base.CLARA_CTL_LEASE_SECONDS;
  return base;
}

/** Spawn an image and CAPTURE its provenance lines — the boot line is evidence in this drill, not
 *  decoration: it is the only place an operator can read which bodies a running image carries.
 *
 *  READ LINE BY LINE, NOT CHUNK BY CHUNK. A `data` event is a slice of a pipe, not a promise of a
 *  whole line: several `console.log`s can arrive in one event, and one line can arrive split across
 *  two. A per-chunk `matchAll` therefore reads a banner cut by a chunk boundary as a banner that was
 *  never logged — on this file's assertions that is a FALSE FAILURE about a released image, and it
 *  is invisible on any host whose boot lines happen to arrive whole.
 *
 *  It also captures `durable world started pid=` (plugins/startWorld.ts): the one line that is THIS
 *  process's own evidence that ITS world is up, as opposed to the estate-wide heartbeat row /ready
 *  reads. */
function spawnImage(label, port, serveTarget) {
  const child = spawn(process.execPath, [childScript], { env: childEnv(port, serveTarget), stdio: ["ignore", "pipe", "pipe"] });
  const state = { label, exited: false, exitInfo: null, banners: [], serving: null, worldStarted: null, stranded: null, stdout: "", stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  const ingest = (raw) => {
    const line = raw.replace(/\r$/, "");
    const banner = /\[clara-runtime\] bundle (\S+) digest=([0-9a-f]{64})/.exec(line);
    if (banner) state.banners.push({ id: banner[1], digest: banner[2] });
    if (!state.serving) {
      const serving = /\[clara-runtime\] serving .*/.exec(line);
      if (serving) state.serving = serving[0];
    }
    if (state.worldStarted === null) {
      const started = /\[clara-runtime\] durable world started pid=(\d+)/.exec(line);
      if (started) state.worldStarted = Number(started[1]);
    }
    if (state.stranded === null) {
      const stranded = /\[clara-runtime\] stranded bodies n=(\d+).*/.exec(line);
      if (stranded) state.stranded = { n: Number(stranded[1]), line: stranded[0] };
    }
  };
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    state.stdout = `${state.stdout}${d}`.slice(-16000);
    pending += d;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) ingest(line);
  });
  child.stdout.on("end", () => {
    if (pending) ingest(pending);
    pending = "";
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    state.stderr = `${state.stderr}${d}`.slice(-8000);
    if (/FATAL|Error:/.test(d)) process.stderr.write(`[${label}:${port}] ${d}`);
  });
  return { child, state, port, label };
}

function waitExit(child, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for a serve child to exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitReady(image, deadlineMs = 90000) {
  const base = `http://127.0.0.1:${image.port}`;
  const end = Date.now() + deadlineMs;
  let healthy = false;
  while (Date.now() < end) {
    try {
      if (!healthy && (await fetch(`${base}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) healthy = true;
      if (healthy && (await fetch(`${base}/ready`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).status === 200) return;
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error(
    `image ${image.label} on ${image.port} did not become ready (/health + /ready 200)`
      + `\n--- child stdout (tail) ---\n${image.state.stdout || "(none)"}`
      + `\n--- child stderr ---\n${image.state.stderr || "(none)"}\n--- exit: ${JSON.stringify(image.state.exitInfo)} ---`,
  );
}

/**
 * WAIT FOR *THIS* IMAGE'S OWN BOOT — the thing `/ready` does not prove, for the reason this file's
 * header now states: /ready's world and control conjuncts are ESTATE-WIDE heartbeat rows with a 30s
 * staleness window, and this drill spawns B one second after killing A on the same database, so B's
 * very first /ready is answered by A's residue.
 *
 * MEASURED, GitHub run 34796679822 — the drill's first execution on a Linux runner. Build A, booting
 * against a pristine database with no predecessor to borrow a beat from, took 11.6s to answer
 * /ready. Build B answered it 1.4s after A was killed, and the drill then asserted B's bundle
 * banners — which plugins/startWorld.ts logs only AFTER `await getWorld().start?.()` — against an
 * empty list. The provenance line survived the same race because it is emitted FIRST, before the
 * census and before the world, which is exactly why only the banner assertion failed.
 *
 * WAITING IS NOT WEAKENING: every fact this drill asserted before, it still asserts. The wait only
 * stops it asking before the process could answer. An image whose world never starts still fails —
 * bounded, naming what never arrived, with the child's own log attached.
 *
 * @returns {Promise<number>} ms spent waiting AFTER /ready already answered 200 — the width of the
 * window /ready cannot see. The caller prints it, so the next runner's number is in the log.
 */
async function waitBooted(image, { banners = [], deadlineMs = 120000 } = {}) {
  const startedAt = Date.now();
  const end = startedAt + deadlineMs;
  const missing = () => banners.filter((id) => !image.state.banners.some((b) => b.id === id));
  for (;;) {
    if (image.state.serving && image.state.worldStarted !== null && missing().length === 0) return Date.now() - startedAt;
    if (image.state.exited || Date.now() >= end) break;
    await sleep(100);
  }
  throw new Error(
    `image ${image.label} on ${image.port} answered /ready but never finished its OWN boot within ${deadlineMs}ms`
      + ` (/ready's world check is an estate-wide heartbeat — a predecessor stopped seconds ago satisfies it)`
      + `\n  provenance line: ${image.state.serving ?? "(never logged)"}`
      + `\n  durable world:   ${image.state.worldStarted === null ? "(never started)" : `started pid=${image.state.worldStarted}`}`
      + `\n  bundle banners:  ${image.state.banners.map((b) => b.id).join(", ") || "(none)"}`
      + `\n  still missing:   ${missing().join(", ") || "(none)"}`
      + (image.state.stranded ? `\n  boot census:     ${image.state.stranded.line}` : "")
      + `\n  exit: ${JSON.stringify(image.state.exitInfo)}`
      + `\n--- child stdout (tail) ---\n${image.state.stdout || "(none)"}`
      + `\n--- child stderr (tail) ---\n${image.state.stderr || "(none)"}`,
  );
}

async function api(port, method, path, body, jwt) {
  const init = {
    method,
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  let parsed = null;
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

const POSTING_DATE = "2026-09-08";
const CENTS = 76543;

function basisFor(memo) {
  return {
    postingDate: POSTING_DATE,
    memo,
    currency: "MYR",
    lines: [
      { accountCode: "6100", debitCents: CENTS, creditCents: 0, description: "office rent" },
      { accountCode: "1100", debitCents: 0, creditCents: CENTS, description: "Maybank" },
    ],
  };
}

const ANSWER = { posting_date: POSTING_DATE, amount_cents: CENTS };

/**
 * Run the rollback-preflight CLI as a real child process and return `{code, stdout, stderr}`.
 *
 * BY SUBPROCESS rather than by import, and only for the frontier leg: every other verdict in this
 * file is read from the module because the drill needs the OBJECT. The frontier rule's whole point
 * is that an operator typing this command before `fly deploy --image <previous>` is stopped, so
 * what has to be measured is the EXIT CODE and the text on stderr — the two things a release
 * script actually reads. It inherits this process's environment, which is the same loopback DSN
 * the gate at the top of this file already parsed and refused to run without.
 */
function runPreflightCli(args) {
  const script = fileURLToPath(new URL("../scripts/rollback-preflight.mjs", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  const probe = await rig.rootQuery(`
    select to_regprocedure('clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)') is not null as open_fn,
           to_regprocedure('clara.answer_work_question(uuid,integer,jsonb,text)') is not null as answer_fn,
           to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit_fn,
           to_regclass('workflow.workflow_runs') is not null as runs_tbl
  `);
  const p = probe.rows[0] ?? {};
  if (!p.open_fn || !p.answer_fn || !p.admit_fn || !p.runs_tbl) {
    console.log("[tb-e2e] SKIPPED — migration 0180 (work questions) or the WDK world is not on this database");
    process.exit(0);
  }

  const query = (sql, params) => rig.rootQuery(sql, params);

  // ==========================================================================
  // THE DOOR. Two refusals, both named, both BEFORE anything is built or spawned.
  // ==========================================================================

  // (1) #637 review S4 — THE ARTIFACT MUST BE A REAL, CURRENT BUILD. This drill spawns
  // `.output/server/index.mjs` as build B and scans it for build A's diff; a missing or stale
  // bundle would let every assertion below pass about code nobody is shipping. The gate is its own
  // module with its own unit cells (tests/built-bundle-gate.test.mjs) so this refusal is proven
  // rather than merely present.
  assertBuiltBundleFresh({
    bundlePath: runtimeBundle,
    sourceRoots: RUNTIME_SOURCE_ROOTS.map((p) => fileURLToPath(new URL(`../${p}`, import.meta.url))),
    registryPath: fileURLToPath(new URL("../workflows/registry.ts", import.meta.url)),
  });
  console.log("[tb-e2e] build gate: .output/server/index.mjs is present, newer than every bundled source, and agrees with registry.ts");

  // (2) REFUSE TO START ON A DIRTY INVENTORY. See this file's header for the measured reason: an
  // image booting against a non-terminal run it cannot replay does not park quietly, it crashes.
  // The census is the PREFLIGHT'S OWN — one implementation, two consumers — read over the whole
  // database against the bodies this tree's artifact actually carries.
  //
  // WHAT IT REFUSES ON, and the line is drawn where the DRILL's own correctness is:
  //   · ANY non-terminal workflow run. Not "any claraWork run": build A exports 48 of 49 bodies, and
  //     a parked run of a body it lacks is precisely the condition that crashed it once. A run this
  //     drill did not stage is also a run it cannot tell from its own.
  //   · Any live unbound `accounting_work` task, for the same reason — the last leg admits one
  //     deliberately and asserts about it by id.
  // What it does NOT refuse on is unrelated live state of other lanes (a held wake task left by an
  // earlier suite on a shared rig). That is #708's own lesson applied to this file: the drill SCOPES
  // its own verdicts to the Works it staged, so foreign rows cannot decide them, and refusing on
  // them would make the drill unrunnable on every rig that has ever run anything else.
  {
    const inventory = await preflight({ query, supported: supportedBodiesFromBundle(readFileSync(runtimeBundle, "utf8")) });
    const liveWorkTasks = inventory.unbound.tasks.filter((t) => t.kind === "accounting_work");
    if (inventory.runs.length > 0 || liveWorkTasks.length > 0) {
      console.error(
        "\nTWO-BUILD CUTOVER E2E: REFUSING TO START — this database already carries live state a two-build drill "
          + "cannot tell from its own:\n"
          + inventory.runs.map((r) => `  - ${r.count} non-terminal run(s) of ${r.body} (${r.name})`).join("\n")
          + (inventory.runs.length > 0 && liveWorkTasks.length > 0 ? "\n" : "")
          + liveWorkTasks.map((t) => `  - unbound accounting_work task ${t.id} [${t.status}] (work ${t.workId})`).join("\n")
          + "\n\nUse a fresh database, or settle/cancel those rows first. Named refusal at the door beats "
          + "failing deep in a later leg — and build A CANNOT boot against a non-terminal run of a body it "
          + "does not export (ReplayDivergenceError, then a crash-only exit; since #637's review it refuses "
          + "to start the world at all).",
      );
      process.exit(1);
    }
    const otherLive = inventory.unbound.tasks.length;
    console.log(
      `[tb-e2e] inventory gate: no non-terminal runs and no unbound accounting_work tasks`
        + (otherLive > 0 ? ` (${otherLive} unrelated live task(s) present — every verdict below is SCOPED, so they decide nothing)` : ""),
    );
  }
  const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const readTask = (id) => rig.rootQuery("select * from clara.agent_tasks where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const readRun = (id) => rig.rootQuery("select id, name, status from workflow.workflow_runs where id = $1", [id]).then((r) => r.rows[0] ?? null);
  const receiptsFor = (work) =>
    rig
      .rootQuery("select id, bundle_digest, outcome from clara.operation_receipts where work_id = $1 order by created_at", [work])
      .then((r) => r.rows);
  const entriesFor = (client) =>
    rig.rootQuery("select count(*)::int as n from clara.journal_entries where client_id = $1", [client]).then((r) => r.rows[0].n);
  const pendingQuestion = (taskId) =>
    rig
      .rootQuery(
        "select id, question_version, fields, reason, work_id, status from clara.agent_interruptions where task_id = $1 and status = 'pending'",
        [taskId],
      )
      .then((r) => r.rows[0] ?? null);

  async function pollTask(taskId, pred, label, deadlineMs = 90000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      last = await readTask(taskId);
      if (last && pred(last)) return last;
      await sleep(250);
    }
    throw new Error(`pollTask timeout (${label}); last=${JSON.stringify(last)}`);
  }

  /** The run row's own settlement LAGS the task's: the body calls `settleWorkStep` and only then
   *  returns, and the WDK writes the run's terminal status after that. Polling is the honest way to
   *  say "it converges" — version-cutover-e2e.mjs's own pollRun exists for the same reason. */
  async function pollRun(runId, pred, label, deadlineMs = 60000) {
    const end = Date.now() + deadlineMs;
    let last = null;
    while (Date.now() < end) {
      last = await readRun(runId);
      if (last && pred(last)) return last;
      await sleep(250);
    }
    throw new Error(`pollRun timeout (${label}); last=${JSON.stringify(last)}`);
  }

  async function pollQuestion(taskId, label, deadlineMs = 90000) {
    const end = Date.now() + deadlineMs;
    while (Date.now() < end) {
      const row = await pendingQuestion(taskId);
      if (row) return row;
      await sleep(250);
    }
    throw new Error(`pollQuestion timeout (${label})`);
  }

  async function seedClient(label) {
    const { owner, firm, client } = await rig.buildFirm(label);
    for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current account", "asset"]]) {
      await rig.humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r", [
        client, code, name, type, rig.opk("acct"),
      ]);
    }
    return { owner, firm, client, jwt: await mint(owner) };
  }

  // =========================================================================
  // BUILD A — the predecessor image. Built, not simulated.
  // =========================================================================
  const built = await buildPreviousVersionImage({ log: (m) => console.log(m) });
  const pair = built.pair;
  // THE BUNDLE IDS ARE DERIVED TOO (wave-3, the first real re-run of this drill). The pair above
  // was always derived, but three `"clara-work/v1"` / two `"clara-work/v2"` LITERALS survived in
  // the assertions below, and the file's own header claimed the whole drill needed no edit at a
  // cutover. The first v2 -> v3 re-run proved that claim false in the loudest possible way — the
  // pair derived correctly and the drill then failed on a string. A bundle id is `clara-work/vN`
  // for `claraWork_vN` (claraWork.vN.bundle.ts's own constant), so it is a function of the pair.
  const bundleIdOf = (identifier) => `clara-work/v${/_v(\d+)$/.exec(identifier)?.[1] ?? "?"}`;
  const prevBundleId = bundleIdOf(pair.previous);
  const pinnedBundleId = bundleIdOf(pair.pinned);
  // AND SO IS THE PARKING SHAPE. The header calls the pair "asymmetric" and that was a v1-vs-v2
  // fact, not a property of cutovers: claraWork_v1 parks a BARE clarify (`openInterruptionStep`,
  // answered through `clara.answer_interruption`) and EVERY successor from v2 on parks a TYPED
  // Work question (`openWorkQuestionStep`, answered through `clara.answer_work_question`). So the
  // rule is derived from the version rather than written down once: v1 is the bare-clarify body,
  // v2+ are the typed ones. A drill on a v3 -> v4 pair will drive the typed door on both sides and
  // still measure what this file exists to measure — that each run stays bound to the body it was
  // admitted under, resumes into it, and settles through its own receipt and digest.
  const parksBareClarify = (version) => version === 1;
  console.log(
    `[tb-e2e] drill pair derived from registry.ts: ${pair.previous} (build A) -> ${pair.pinned} (build B)`
      + `${built.reused ? " [REUSED scratch artifact]" : ` [built in ${(built.buildMs / 1000).toFixed(1)}s]`}`,
  );

  // STATIC PROOF that A is a genuine rollback target, read off the ARTIFACT rather than the source.
  const bodiesA = supportedBodiesFromBundle(readFileSync(built.serverEntry, "utf8"));
  const bodiesB = supportedBodiesFromBundle(readFileSync(runtimeBundle, "utf8"));
  // The database's own frontier, read ONCE and printed, so the frontier-rule leg below reads as a
  // fact about THIS chain rather than as an assertion about a constant.
  const frontierVersion = await readMigrationFrontier(query);
  console.log(`[tb-e2e] database frontier: ${frontierVersion}`);
  assert.ok(bodiesA.includes(pair.previous), `build A's bundle registers ${pair.previous}`);
  assert.equal(bodiesA.includes(pair.pinned), false, `build A's bundle does NOT register ${pair.pinned} — it cannot run the successor at all`);
  assert.ok(bodiesB.includes(pair.previous), `build B's bundle STILL registers ${pair.previous} (policy (c): a parked run is never stranded)`);
  assert.ok(bodiesB.includes(pair.pinned), `build B's bundle registers ${pair.pinned}`);
  assert.equal(bodiesB.length, bodiesA.length + 1, "the two images differ by EXACTLY one body — the variable under test is isolated");
  console.log(`[tb-e2e] artifacts: A carries ${bodiesA.length} bodies (no ${pair.pinned}), B carries ${bodiesB.length} (both)`);

  const imageA = spawnImage("A", await ephemeralPort(), built.serveScript);
  let imageB = null;
  let w1 = null;
  let w2 = null;
  let ctxA = null;
  let ctxB = null;
  let v1Digest = null;
  let v2Digest = null;

  try {
    await waitReady(imageA);
    // A's OWN boot, not the estate's heartbeat: the sibling e2es that share this rig were beating
    // into a database moments ago, and a /ready answered by a process that is already gone proves
    // nothing about this one. Costs nothing when A is genuinely up — it already is by then.
    await waitBooted(imageA);
    assert.ok(imageA.state.serving, "build A emitted the provenance boot line");
    assert.match(
      imageA.state.serving,
      new RegExp(`claraWork=${pair.previous}\\b`),
      `build A's boot line pins claraWork to ${pair.previous} (got: ${imageA.state.serving})`,
    );
    assert.equal(
      new RegExp(`claraWork=${pair.pinned}\\b`).test(imageA.state.serving),
      false,
      "build A's boot line does NOT name the successor as its pin",
    );
    assert.match(imageA.state.serving, new RegExp(`bodies=${bodiesA.length}\\b`), "…and its body count matches its own bundle");
    console.log(`[tb-e2e] A ready: ${imageA.state.serving}`);

    // --- W1: admitted by the PREDECESSOR image -----------------------------
    ctxA = await seedClient("tb-a");
    const admitA = await api(imageA.port, "POST", "/api/work/journal", { clientId: ctxA.client, intentKey: randomUUID(), basis: basisFor("office rent — W1 (build A)") }, ctxA.jwt);
    assert.equal(admitA.status, 202, `W1 admitted 202 by build A (got ${admitA.status} ${JSON.stringify(admitA.body)})`);
    w1 = admitA.body;

    const q1 = await pollQuestion(w1.task_id, "W1 parks on build A");
    const t1Parked = await readTask(w1.task_id);
    assert.equal(t1Parked.status, "awaiting_input", "W1 is honest about being blocked");
    assert.ok(t1Parked.workflow_run_id, "W1's task is BOUND to a workflow run");
    const run1 = await readRun(t1Parked.workflow_run_id);
    assert.equal(
      bodyIdentifierOf(run1.name),
      pair.previous,
      `W1's run bound ${pair.previous}, derived from the run ROW (got ${run1.name})`,
    );
    const work1 = await readWork(w1.work_id);
    v1Digest = work1.bundle?.digest;
    assert.equal(work1.bundle?.id, prevBundleId, `W1's Work row records the predecessor bundle id ${prevBundleId} (got ${work1.bundle?.id})`);
    assert.match(String(v1Digest), /^[0-9a-f]{64}$/, "…with its digest");
    // Decision (a), now DERIVED from the predecessor's version rather than written down: v1 parks a
    // BARE clarify (no typed fields, no reason — 0180 added both, and v1 fills neither); every
    // successor from v2 on parks a TYPED Work question.
    if (parksBareClarify(pair.previousVersion)) {
      assert.equal((q1.fields ?? []).length, 0, `${pair.previous} parks a BARE clarify: ZERO typed fields`);
      assert.equal(q1.reason, null, "…and no reason column either — 0180 added both for the successor, and the predecessor fills neither");
    } else {
      assert.ok(Array.isArray(q1.fields) && q1.fields.length > 0, `${pair.previous} parks a TYPED Work question (got fields=${JSON.stringify(q1.fields)})`);
      assert.ok(q1.reason, "…carrying the REASON the model gave");
    }
    console.log(
      `[tb-e2e] W1 parked on ${pair.previous} (${parksBareClarify(pair.previousVersion) ? "bare clarify" : `typed Work question, ${(q1.fields ?? []).length} fields`}),`
        + ` bundle ${work1.bundle?.id} ${String(v1Digest).slice(0, 12)}…`,
    );

    // --- PREFLIGHT while only W1 is live ----------------------------------
    // Rolling FORWARD to B is fine: B carries the predecessor. Rolling back to an image that does
    // NOT carry it refuses, and names it.
    // EVERY VERDICT IN THIS DRILL IS THE SCOPED ONE (#708 / review B2). `preflight` returns two:
    // `verdict` is the GLOBAL authority the CLI's exit code follows, and `scoped.verdict` answers
    // only about the rows this caller named. A drill on a shared rig must read the scoped one or a
    // stranger's parked row decides its assertions — and the two are deliberately never merged, so
    // the divergence itself is asserted below, once, where this drill CREATES it.
    const fwd = await preflight({ query, supported: bodiesB, scope: { workIds: [w1.work_id] } });
    assert.equal(fwd.scoped.verdict, "allowed", "a target that carries the predecessor allows the cutover");
    const backLessV1 = await preflight({ query, supported: bodiesB.filter((b) => b !== pair.previous), scope: { workIds: [w1.work_id] } });
    assert.equal(backLessV1.scoped.verdict, "refused", `a target WITHOUT ${pair.previous} refuses while W1 is parked on it`);
    assert.ok(backLessV1.scoped.outside.some((row) => row.body === pair.previous), "…and the refusal names the body");
    console.log(`[tb-e2e] preflight: target-with-${pair.previous} allowed; target-without-${pair.previous} REFUSED naming it`);

    // --- STOP A. Sequenced, not raced: one leader at a time. ---------------
    imageA.child.kill("SIGTERM");
    await waitExit(imageA.child);
    console.log(`[tb-e2e] build A stopped (exit ${JSON.stringify(imageA.state.exitInfo)}) — W1 is parked on a body no running process now carries`);

    // --- BUILD B. The successor image, this tree's own build. ---------------
    imageB = spawnImage("B", await ephemeralPort(), runtimeServe);
    await waitReady(imageB);
    // THE WINDOW THIS DRILL CREATES ITSELF: A was beating into this database one second ago, so the
    // /ready above can be — and on run 34796679822 was — answered by A's residue. Wait for B's own
    // boot lines, including the two banners asserted immediately below.
    const bootWindowB = await waitBooted(imageB, { banners: [prevBundleId, pinnedBundleId] });
    assert.ok(imageB.state.serving, "build B emitted the provenance boot line");
    assert.match(imageB.state.serving, new RegExp(`claraWork=${pair.pinned}\\b`), `build B pins claraWork to ${pair.pinned}`);
    assert.match(imageB.state.serving, new RegExp(`bodies=${bodiesB.length}\\b`), "…and carries one more body than A");
    // Both bundle banners, byte-identical to their frozen constants, stay on B.
    assert.ok(imageB.state.banners.some((b) => b.id === prevBundleId), `B logs the predecessor bundle banner ${prevBundleId}`);
    assert.ok(imageB.state.banners.some((b) => b.id === pinnedBundleId), `B logs the successor bundle banner ${pinnedBundleId}`);
    v2Digest = imageB.state.banners.find((b) => b.id === pinnedBundleId)?.digest ?? null;
    assert.match(String(v2Digest), /^[0-9a-f]{64}$/, "the successor digest is readable from B's own log");
    console.log(`[tb-e2e] B ready: ${imageB.state.serving}`);
    console.log(
      `[tb-e2e] B's OWN durable world started pid=${imageB.state.worldStarted}, ${bootWindowB}ms after /ready answered 200`
        + " — the window /ready cannot see, because its world check is an estate-wide heartbeat build A had just refreshed",
    );

    // /api/build-info is the HTTP half of the same claim.
    ctxB = await seedClient("tb-b");
    const infoB = await api(imageB.port, "GET", "/api/build-info", undefined, ctxB.jwt);
    assert.equal(infoB.status, 200, "build-info answers a scoped session");
    assert.equal(infoB.body.pins.claraWork, pair.pinned, `build B's /api/build-info pins claraWork = ${pair.pinned}`);
    assert.ok(infoB.body.bodies.includes(pair.previous), "…and reports that it STILL carries the predecessor body");
    assert.ok(infoB.body.bodies.includes(pair.pinned), "…and the successor");
    assert.deepEqual([...infoB.body.bodies].sort(), [...bodiesB].sort(), "the route's roster and the ARTIFACT's own directives agree exactly");
    console.log(`[tb-e2e] B /api/build-info: pins.claraWork=${infoB.body.pins.claraWork}, ${infoB.body.bodies.length} bodies, frontier ${infoB.body.frontier?.max_version}`);

    // --- W2: admitted by the SUCCESSOR image -------------------------------
    const admitB = await api(imageB.port, "POST", "/api/work/journal", { clientId: ctxB.client, intentKey: randomUUID(), basis: basisFor("office rent — W2 (build B)") }, ctxB.jwt);
    assert.equal(admitB.status, 202, `W2 admitted 202 by build B (got ${admitB.status} ${JSON.stringify(admitB.body)})`);
    w2 = admitB.body;

    const q2 = await pollQuestion(w2.task_id, "W2 parks on build B");
    const t2Parked = await readTask(w2.task_id);
    const run2 = await readRun(t2Parked.workflow_run_id);
    assert.equal(bodyIdentifierOf(run2.name), pair.pinned, `W2's run bound ${pair.pinned} (got ${run2.name})`);
    const work2 = await readWork(w2.work_id);
    assert.equal(work2.bundle?.digest, v2Digest, "W2's Work row records the digest B logged — one bundle, one claim");
    assert.notEqual(v1Digest, v2Digest, "the two Works carry DISTINCT bundle digests");
    // Decision (a): the successor parks a TYPED Work question.
    assert.ok(Array.isArray(q2.fields) && q2.fields.length === 2, `${pair.pinned} parks a TYPED Work question (got fields=${JSON.stringify(q2.fields)})`);
    assert.equal(q2.question_version, 1);
    assert.ok(q2.reason, "…carrying the REASON the model gave");
    console.log(`[tb-e2e] W2 parked on ${pair.pinned} (typed Work question, ${q2.fields.length} fields), bundle ${work2.bundle?.id}`);

    // --- PREFLIGHT while BOTH are live ------------------------------------
    const backToA = await preflight({ query, supported: bodiesA, scope: { workIds: [w1.work_id, w2.work_id] } });
    assert.equal(backToA.scoped.verdict, "refused", "rolling back to build A REFUSES while W2 is live on the successor");
    assert.ok(backToA.scoped.outside.some((row) => row.body === pair.pinned), `…naming ${pair.pinned} as the body A does not carry`);
    assert.equal(backToA.scoped.outside.some((row) => row.body === pair.previous), false, "…and NOT naming the predecessor, which A does carry");
    console.log(`[tb-e2e] preflight: rollback to A REFUSED, naming ${pair.pinned}`);

    // REVIEW B2, created by this drill rather than staged: ask the SAME question about W1 alone.
    // Its own lane is clear — W1 is parked on a body build A carries — and the honest scoped answer
    // is "allowed". The GLOBAL verdict over the same read is REFUSED, because W2 is parked on a body
    // A does not carry, and that is the verdict the CLI's exit code follows. A scope narrows the
    // question; it may never widen the answer.
    const scopedToW1 = await preflight({ query, supported: bodiesA, scope: { workIds: [w1.work_id] } });
    assert.equal(scopedToW1.scoped.verdict, "allowed", "scoped to W1, the answer is honestly yes");
    assert.equal(scopedToW1.verdict, "refused", "…and the GLOBAL verdict, which the exit code follows, is NO");
    assert.ok(
      scopedToW1.outside.some((row) => row.body === pair.pinned),
      `the global census names W2's body even though the scope never mentioned it; got ${JSON.stringify(scopedToW1.outside)}`,
    );
    console.log(`[tb-e2e] preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES, naming ${pair.pinned}`);

    // --- RESUME W1 on its ORIGINAL body, inside build B --------------------
    // THE PREDECESSOR'S OWN DOOR, chosen by its version for the reason stated where the pair is
    // derived: v1's bare clarify is answered through `clara.answer_interruption`, a typed Work
    // question through `clara.answer_work_question`. B carries the predecessor body either way, so
    // the hook resumes into it.
    if (parksBareClarify(pair.previousVersion)) {
      await rig.humanQuery(ctxA.owner, "select clara.answer_interruption(p_id=>$1, p_answer=>$2::jsonb, p_op_key=>$3)", [
        q1.id,
        JSON.stringify(ANSWER),
        `tb-w1-${randomUUID()}`,
      ]);
    } else {
      await rig.humanQuery(ctxA.owner, "select clara.answer_work_question($1::uuid,$2::int,$3::jsonb,$4::text) as r", [
        q1.id,
        q1.question_version ?? 1,
        JSON.stringify(ANSWER),
        `tb-w1-${randomUUID()}`,
      ]);
    }
    const t1Done = await pollTask(w1.task_id, (t) => ["completed", "failed", "cancelled"].includes(t.status), "W1 settles inside build B", 120000);
    assert.equal(t1Done.status, "completed", `W1 completed (got ${t1Done.status}/${t1Done.error_code})`);
    const run1After = await pollRun(
      t1Parked.workflow_run_id,
      (r) => ["completed", "failed", "cancelled"].includes(r.status),
      "W1's run reaches a terminal status",
    );
    assert.equal(run1After.name, run1.name, "PIN: W1's run NAME is invariant across the resume — it never migrated to the successor");
    assert.equal(bodyIdentifierOf(run1After.name), pair.previous, `…and it is still ${pair.previous}`);
    assert.equal(run1After.status, "completed", `W1's run itself completed (got ${run1After.status})`);
    const r1 = await receiptsFor(w1.work_id);
    const committed1 = r1.filter((row) => row.outcome === "committed");
    assert.equal(committed1.length, 1, `W1 has exactly ONE committed receipt (got ${JSON.stringify(r1)})`);
    assert.equal(committed1[0].bundle_digest, v1Digest, "…and it carries the PREDECESSOR's digest, not the running image's");
    assert.equal(await entriesFor(ctxA.client), 1, "exactly ONE journal entry for W1's client");
    console.log(`[tb-e2e] RESUME W1: completed on ${pair.previous} inside build B (name invariant), 1 receipt @ ${String(v1Digest).slice(0, 12)}…`);

    // --- RESUME W2 through the successor's own door ------------------------
    await rig.humanQuery(ctxB.owner, "select clara.answer_work_question($1::uuid,$2::int,$3::jsonb,$4::text) as r", [
      q2.id,
      1,
      JSON.stringify(ANSWER),
      `tb-w2-${randomUUID()}`,
    ]);
    const t2Done = await pollTask(w2.task_id, (t) => ["completed", "failed", "cancelled"].includes(t.status), "W2 settles", 120000);
    assert.equal(t2Done.status, "completed", `W2 completed (got ${t2Done.status}/${t2Done.error_code})`);
    const r2 = await receiptsFor(w2.work_id);
    const committed2 = r2.filter((row) => row.outcome === "committed");
    assert.equal(committed2.length, 1, `W2 has exactly ONE committed receipt (got ${JSON.stringify(r2)})`);
    assert.equal(committed2[0].bundle_digest, v2Digest, "…carrying the SUCCESSOR's digest");
    assert.equal(await entriesFor(ctxB.client), 1, "exactly ONE journal entry for W2's client");
    assert.notEqual(committed1[0].bundle_digest, committed2[0].bundle_digest, "TWO DISTINCT bundle digests, one receipt each — the cutover is legible from the ledger alone");
    const run2After = await pollRun(
      t2Parked.workflow_run_id,
      (r) => ["completed", "failed", "cancelled"].includes(r.status),
      "W2's run reaches a terminal status",
    );
    assert.equal(run2After.name, run2.name, "PIN: W2's run name is invariant too — neither run ever migrated");
    assert.equal(run2After.status, "completed", `W2's run itself completed (got ${run2After.status})`);
    console.log(`[tb-e2e] RESUME W2: completed on ${pair.pinned}, 1 receipt @ ${String(v2Digest).slice(0, 12)}…`);

    // --- PREFLIGHT once both have settled ---------------------------------
    const drained = await preflight({ query, supported: bodiesA, scope: { workIds: [w1.work_id, w2.work_id] } });
    assert.equal(drained.scoped.verdict, "allowed", "with BOTH Works terminal, the SAME build-A target now ALLOWS — the inventory tracks live state, not a snapshot");
    console.log("[tb-e2e] preflight: with both Works settled, rollback to A is now ALLOWED");

    // --- …AND THE DATABASE HAS A VOTE OF ITS OWN. THE FRONTIER RULE (wave-3, #815) ----
    // This is the leg neither census can see, and the drained state above is what makes it
    // legible: the run census is clean, no task is unbound, the SCOPED verdict just said ALLOWED —
    // and a target that predates the applied schema's own rule is REFUSED anyway. 0195 grandfathers
    // pre-`claraWork_v3` bundles so a forward cutover finishes honestly, which means a rollback to
    // an image without that body would run the whole Work lane through the grandfather arm: the
    // egress wall in force in the schema, and nothing at all subject to it.
    //
    // THE REQUIRED BODY IS READ FROM THE RULE TABLE, NEVER ASSUMED TO BE THE CUT'S SUCCESSOR, and
    // that is this leg's own repair at the wave 2026-09-15 cut. The leg was authored at the
    // claraWork v2 -> v3 pair, where `pair.pinned` and the body 0195 requires happened to be the
    // SAME identifier, and it wrote `pair.pinned` into four assertions. At the v3 -> v4 pair they
    // come apart: the rule still requires `claraWork_v3`, which build A — the v3 image — CARRIES,
    // so the old text asserted a refusal that must not happen and the drill went red on a fact that
    // was correct. `frontierBodyViolations(frontier, [])` names every body the applied schema
    // demands at this instant; everything below is derived from that, so the next cut moves nothing
    // here.
    //
    // AND IT IS STILL MEASURED BY DIFFERENCE, not by demanding a pristine estate. This drill runs
    // on a shared rig and deliberately tolerates foreign live rows (#708, and its own door refuses
    // only on non-terminal runs and unbound `accounting_work` tasks) — a `held` wake task left by an
    // earlier suite strands against EVERY target, so "the global verdict refuses" alone would not
    // prove the frontier rule did it. The pair of verdicts below differs in exactly the required
    // bodies, at the same instant on the same database, so whatever else the estate is carrying
    // cancels out. What CHANGED is only where the difference comes from: at a pair whose
    // predecessor predates the rule it is build A's own roster, and at a later pair it is build A's
    // roster with the required bodies removed — a target that predates the rule, which is what the
    // rule is about either way.
    assert.deepEqual(drained.outside, [], "frontier leg: the RUN census is clean — nothing is parked outside build A");
    assert.deepEqual(
      drained.unbound.tasks.filter((t) => t.kind === "accounting_work"),
      [],
      "frontier leg: …and the Work lane itself is fully drained, which is the state a rollback would be taken in",
    );
    assert.equal(drained.frontier.version, frontierVersion, "the preflight read the database's OWN frontier");

    // Every body the applied schema demands, as the rule table itself answers it for an empty
    // roster. A frontier that carried no rule at all would make this whole leg vacuous, so it is a
    // control rather than a lookup.
    const requiredBodies = [...new Set(frontierBodyViolations(frontierVersion, []).map((v) => v.body))];
    assert.ok(
      requiredBodies.length > 0,
      `control: a database at ${frontierVersion} must carry at least one frontier body rule; got ${JSON.stringify(requiredBodies)}`,
    );
    assert.ok(
      frontierBodyViolations(frontierVersion, []).some((v) => v.migration.startsWith("0195_")),
      "control: 0195's rule is one of them — this is the leg it was written for",
    );
    // BUILD A'S OWN ANSWER, STATED RATHER THAN ASSUMED: exactly the required bodies it does not
    // carry, no more and no fewer.
    const aMissing = requiredBodies.filter((b) => !bodiesA.includes(b));
    assert.deepEqual(
      [...drained.frontier.violations.map((v) => v.body)].sort(),
      [...aMissing].sort(),
      `build A's frontier violations are exactly the required bodies it lacks; got ${JSON.stringify(drained.frontier.violations)}`,
    );

    // THE TARGET THE RULE IS ABOUT — an image from before the rule existed. Build A's roster minus
    // the required bodies IS build A at the v2 -> v3 pair (the subtraction removes nothing there).
    const preRuleBodies = bodiesA.filter((b) => !requiredBodies.includes(b));
    const preRule = await preflight({ query, supported: preRuleBodies, scope: { workIds: [w1.work_id, w2.work_id] } });
    assert.equal(preRule.verdict, "refused",
      `the GLOBAL verdict refuses a drained rollback to a pre-rule target (reasons ${JSON.stringify(preRule.reasons)})`);
    assert.ok(preRule.reasons.includes("frontier_requires_body"),
      `…on the frontier rule (reasons ${JSON.stringify(preRule.reasons)})`);
    assert.ok(
      preRule.frontier.violations.some((v) => v.migration.startsWith("0195_") && requiredBodies.includes(v.body)),
      `…naming 0195 and a required body; got ${JSON.stringify(preRule.frontier.violations)}`,
    );
    // THE CONTROL: the same question, the same instant, the required bodies added back — the
    // frontier reason is gone and nothing else about the answer moved. That is the rule isolated.
    const withRequired = await preflight({
      query,
      supported: [...new Set([...preRuleBodies, ...requiredBodies])],
      scope: { workIds: [w1.work_id, w2.work_id] },
    });
    assert.deepEqual(withRequired.frontier.violations, [], `adding ${requiredBodies.join(", ")} satisfies the applied schema's rule`);
    assert.equal(withRequired.reasons.includes("frontier_requires_body"), false, "…so the reason is gone");
    assert.deepEqual(
      preRule.reasons.filter((r) => r !== "frontier_requires_body"),
      withRequired.reasons,
      "…and NOTHING else about the verdict moved: the two answers differ in exactly that one reason",
    );
    console.log(
      `[tb-e2e] preflight frontier rule: database at ${drained.frontier.version} REFUSES a target without `
        + `${requiredBodies.join(", ")}; adding it clears the reason `
        + `(build A itself ${aMissing.length === 0 ? "CARRIES the required body, so its own verdict is allowed" : `lacks ${aMissing.join(", ")}`})`,
    );

    // THE COMMAND ITSELF, because the rule exists for the moment an operator types it before
    // `fly deploy --image <previous>`: what has to be true is the EXIT CODE and the text on stderr.
    // The pre-rule roster goes in through `--supported`, the third of the three doors, for the
    // reason above — `--target-bundle <A>` reads a REAL artifact, and at a pair whose predecessor
    // already carries the required body that artifact is not a pre-rule target at all.
    const cliA = await runPreflightCli(["--supported", preRuleBodies.join(",")]);
    assert.equal(cliA.code, 1, `rollback-preflight --supported <pre-rule roster> must exit 1 (got ${cliA.code})\n${cliA.stdout}\n${cliA.stderr}`);
    assert.match(cliA.stderr, /frontier_requires_body/, "…naming the reason");
    assert.match(cliA.stderr, /0195_work_egress_purpose_and_execution_trace/, "…the migration whose rule is in force");
    for (const body of requiredBodies) {
      assert.match(cliA.stderr, new RegExp(body), `…and ${body}, the body the target does not carry`);
    }
    // THE POSITIVE CONTROL, through the same command AND through a REAL artifact: build B's own
    // bundle carries every required body, so the frontier leg passes. Its EXIT CODE is deliberately
    // not asserted, for the reason above — a foreign stranded row on a shared rig is exactly what
    // this drill refuses to let decide its assertions — so the leg is read out of `--json` instead
    // of out of the process's status.
    const cliB = await runPreflightCli(["--target-bundle", runtimeBundle, "--json"]);
    // The CLI prints the JSON object and THEN its one-line verdict banner, so the payload is taken
    // from the first `{` to the last line-initial `}` rather than by parsing the whole stream.
    const cliBJson = JSON.parse(/^\{[\s\S]*^\}/m.exec(cliB.stdout)?.[0] ?? cliB.stdout);
    assert.deepEqual(cliBJson.frontier.violations, [], "the CLI's own answer for build B: the applied schema's rule is satisfied");
    assert.equal(cliBJson.reasons.includes("frontier_requires_body"), false);
    assert.equal(cliBJson.frontier.version, frontierVersion, "…read from the same database");
    console.log(
      `[tb-e2e] preflight CLI: --supported <pre-rule roster> exits ${cliA.code} naming frontier_requires_body; `
        + `--target-bundle B carries ${requiredBodies.join(", ")} and clears the rule`,
    );

    // --- STOP B, then the UNBOUND-WORK leg --------------------------------
    // With no engine running, an admitted Work's task never acquires a workflow run — the state
    // nothing counted before #637, and the one a run census cannot see by construction.
    imageB.child.kill("SIGTERM");
    await waitExit(imageB.child);
    imageB = null;

    const ctxC = await seedClient("tb-c");
    const orphan = await rig
      .asRuntime((c) =>
        c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
          ctxC.client, ctxC.owner, `tb-orphan-${randomUUID()}`,
          JSON.stringify({
            posting_date: POSTING_DATE,
            memo: "office rent — unbound",
            currency: "MYR",
            lines: [
              { account_code: "6100", debit_cents: CENTS, credit_cents: 0, description: "office rent" },
              { account_code: "1100", debit_cents: 0, credit_cents: CENTS, description: "Maybank" },
            ],
          }),
          "user_direct", JSON.stringify([]), rig.DEFAULT_MODEL,
        ]),
      )
      .then((r) => r.rows[0].r);
    try {
      const orphanTask = await readTask(orphan.task_id);
      assert.equal(orphanTask.workflow_run_id, null, "with no engine running, the admitted task is bound to NO workflow run");
      const noClaraWork = await preflight({ query, supported: bodiesA.filter((b) => !b.startsWith("claraWork")), scope: { workIds: [orphan.work_id] } });
      assert.equal(noClaraWork.scoped.verdict, "refused", "a target with NO claraWork body refuses on the unbound task ALONE");
      assert.deepEqual(noClaraWork.scoped.outside, [], "…and it is not a workflow-run refusal: there is no run to be outside anything");
      // `unbound_task`, not `unbound_accounting_work`: the census covers EVERY kind whose task can
      // become a run (#637 review B3), so the reason names the SHAPE — a live task bound to no run
      // — and the task list names which row and which class.
      assert.ok(noClaraWork.scoped.reasons.includes("unbound_task"), `…the reason is its own (got ${JSON.stringify(noClaraWork.scoped.reasons)})`);
      assert.deepEqual(noClaraWork.scoped.unbound.strandedClasses, ["claraWork"], "…and the stranded CLASS is named");
      const withClaraWork = await preflight({ query, supported: bodiesA, scope: { workIds: [orphan.work_id] } });
      assert.equal(withClaraWork.scoped.verdict, "allowed", "a target that carries ANY claraWork body can run it — an unbound task has not chosen a version yet");
      console.log("[tb-e2e] unbound Work: refuses on its own against a claraWork-less target; allowed against build A");
    } finally {
      // CANCELLED, never deleted: clara.agent_tasks refuses a DELETE (CLR08) and
      // clara.accounting_work is immutable by trigger.
      await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [orphan.task_id]);
    }
  } catch (err) {
    // THE FAILING IMAGE'S OWN LOG, printed once, before the cleanup below kills it (wave-3).
    // Every assertion in this file is about what a RUNTIME PROCESS did, and the first v2 -> v3
    // re-run failed on `W1 completed (got failed/internal)` with no way to see WHY from this
    // file's output — the child's stdout was captured into `state.stdout` and then discarded.
    // A drill whose failure cannot be read is a drill someone will re-run rather than diagnose.
    for (const img of [imageA, imageB]) {
      if (!img) continue;
      const tail = (img.state.stdout ?? "").split("\n").slice(-40).join("\n");
      const errTail = (img.state.stderr ?? "").split("\n").slice(-20).join("\n");
      if (tail.trim()) console.error(`\n[tb-e2e] --- image ${img.state.label} stdout (last 40 lines) ---\n${tail}`);
      if (errTail.trim()) console.error(`[tb-e2e] --- image ${img.state.label} stderr (last 20 lines) ---\n${errTail}`);
    }
    throw err;
  } finally {
    // Kill any image still up FIRST: a running engine would re-create what the cleanup below
    // settles.
    for (const img of [imageA, imageB]) {
      if (img && !img.state.exited) {
        img.child.kill("SIGKILL");
        await waitExit(img.child).catch(() => {});
      }
    }
    // Leave the estate re-runnable. ONLY this drill's own rows, by id: a non-terminal successor run
    // left behind makes the NEXT run's build A crash on replay (this file's header records the
    // measurement), so an interrupted drill must not poison the next one. Tasks are CANCELLED
    // rather than deleted (clara.agent_tasks refuses a DELETE, CLR08); runs are marked cancelled
    // rather than deleted so the WDK's own event log stays intact for anyone reading it.
    const mine = [w1, w2].filter(Boolean);
    for (const w of mine) {
      await rig
        .rootQuery(
          `update workflow.workflow_runs set status = 'cancelled'
             where status not in ('completed','failed','cancelled')
               and id = (select workflow_run_id from clara.agent_tasks where id = $1)`,
          [w.task_id],
        )
        .catch(() => {});
      await rig
        .rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1 and status in ('queued','running','awaiting_input')", [w.task_id])
        .catch(() => {});
    }
    await rig.endPool().catch(() => {});
    if (process.env.CLARA_TWO_BUILD_REUSE !== "1") removeScratchTree();
  }

  console.log("\nTWO-BUILD CUTOVER E2E: ALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nTWO-BUILD CUTOVER E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
