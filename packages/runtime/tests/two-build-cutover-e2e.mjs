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
// `claraWork: claraWork_vN` pin and its retained `export { claraWork_vM }` roster. Today the drill
// is v1 -> v2; when a successor lands it becomes v2 -> v3 with no edit in this file.
//
// THE PAIR IS ASYMMETRIC, AND THAT IS ACCEPTED RATHER THAN PAPERED OVER. The two bodies do not
// park the same way, and the drill is honest about driving two different mechanisms:
//   · claraWork_v1 parks a BARE clarify (`openInterruptionStep`, claraWork.v1.ts:141-142) and is
//     answered through `clara.answer_interruption`.
//   · claraWork_v2 parks a typed WORK QUESTION (`openWorkQuestionStep`, claraWork.v2.ts:176-183)
//     and is answered through `clara.answer_work_question`.
// What the drill measures is NOT that the two park identically — they do not — but that each run
// stays bound to the body it was admitted under, resumes into that body, and settles through its
// OWN receipt carrying that body's OWN bundle digest.
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
// WHAT IT DELIBERATELY DOES NOT ASSERT: a `(CLR13, work_cancelled)` classification. Nothing here
// cancels, and the frozen v1/v2 error tables map that pair to `state_changed` — asserting a
// "correct" classification in a drill that does not exercise it would be a claim about a table
// rather than about this cutover.
//
// IT REFUSES TO START ON A DIRTY INVENTORY, with a named reason, and that is not fussiness — it is
// a MEASURED hazard. A first run of this drill was interrupted mid-way and left a non-terminal
// successor run behind; on the next run, build A booted, its engine re-enqueued a run whose body it
// does not export, and the replay raised `ReplayDivergenceError`. The crash-only supervisor then
// exited 1. So the honest reading of a rollback to a body-less image is stronger than the README's
// old "the lane PARKS": the ENGINE can crash-loop. That is the whole reason the preflight is a gate
// rather than a note, and it is why this file checks the inventory BEFORE it builds anything —
// failing at the door with an instruction beats failing deep in a later leg (the #708 posture).
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
import { bodyIdentifierOf, preflight, supportedBodiesFromBundle } from "../lib/rollback-preflight.mjs";

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
 *  decoration: it is the only place an operator can read which bodies a running image carries. */
function spawnImage(label, port, serveTarget) {
  const child = spawn(process.execPath, [childScript], { env: childEnv(port, serveTarget), stdio: ["ignore", "pipe", "pipe"] });
  const state = { label, exited: false, exitInfo: null, banners: [], serving: null, stranded: null, stderr: "" };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    for (const m of d.matchAll(/\[clara-runtime\] bundle (\S+) digest=([0-9a-f]{64})/g)) state.banners.push({ id: m[1], digest: m[2] });
    const serving = /\[clara-runtime\] serving [^\n]*/.exec(d);
    if (serving && !state.serving) state.serving = serving[0];
    const stranded = /\[clara-runtime\] stranded bodies n=(\d+)[^\n]*/.exec(d);
    if (stranded && state.stranded === null) state.stranded = { n: Number(stranded[1]), line: stranded[0] };
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
      + `\n--- child stderr ---\n${image.state.stderr || "(none)"}\n--- exit: ${JSON.stringify(image.state.exitInfo)} ---`,
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

  // REFUSE TO START ON A DIRTY INVENTORY. See this file's header for the measured reason: an image
  // booting against a non-terminal run it cannot replay does not park quietly, it crashes.
  {
    const live = await rig.rootQuery(
      `select name, status, count(*)::int as n
         from workflow.workflow_runs
        where status not in ('completed','failed','cancelled') and name like '%claraWork%'
        group by 1, 2`,
    );
    const unbound = await rig.rootQuery(
      "select id, work_id from clara.agent_tasks where kind = 'accounting_work' and status in ('queued','running') and workflow_run_id is null",
    );
    if (live.rowCount > 0 || unbound.rowCount > 0) {
      console.error(
        "\nTWO-BUILD CUTOVER E2E: REFUSING TO START — this database already carries live accounting-Work state, "
          + "and a two-build drill cannot tell its own runs from those:\n"
          + live.rows.map((r) => `  - ${r.n} ${r.status} run(s) of ${r.name}`).join("\n")
          + (live.rowCount > 0 && unbound.rowCount > 0 ? "\n" : "")
          + unbound.rows.map((r) => `  - unbound accounting_work task ${r.id} (work ${r.work_id})`).join("\n")
          + "\n\nUse a fresh database, or settle/cancel those rows first. Named refusal at the door beats "
          + "failing deep in a later leg — and build A CANNOT boot against a non-terminal successor run "
          + "(ReplayDivergenceError, then a crash-only exit).",
      );
      process.exit(1);
    }
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
  console.log(
    `[tb-e2e] drill pair derived from registry.ts: ${pair.previous} (build A) -> ${pair.pinned} (build B)`
      + `${built.reused ? " [REUSED scratch artifact]" : ` [built in ${(built.buildMs / 1000).toFixed(1)}s]`}`,
  );

  // STATIC PROOF that A is a genuine rollback target, read off the ARTIFACT rather than the source.
  const bodiesA = supportedBodiesFromBundle(readFileSync(built.serverEntry, "utf8"));
  const bodiesB = supportedBodiesFromBundle(readFileSync(runtimeBundle, "utf8"));
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
    assert.equal(work1.bundle?.id, "clara-work/v1", `W1's Work row records the predecessor bundle id (got ${work1.bundle?.id})`);
    assert.match(String(v1Digest), /^[0-9a-f]{64}$/, "…with its digest");
    // Decision (a): the predecessor parks a BARE clarify — no typed fields, no reason.
    assert.equal((q1.fields ?? []).length, 0, `${pair.previous} parks a BARE clarify: ZERO typed fields (the asymmetric pair, stated in this file's header)`);
    assert.equal(q1.reason, null, "…and no reason column either — 0180 added both for the successor, and the predecessor fills neither");
    console.log(`[tb-e2e] W1 parked on ${pair.previous} (bare clarify), bundle ${work1.bundle?.id} ${String(v1Digest).slice(0, 12)}…`);

    // --- PREFLIGHT while only W1 is live ----------------------------------
    // Rolling FORWARD to B is fine: B carries the predecessor. Rolling back to an image that does
    // NOT carry it refuses, and names it.
    const fwd = await preflight({ query, supported: bodiesB, scope: { workIds: [w1.work_id] } });
    assert.equal(fwd.verdict, "allowed", "a target that carries the predecessor allows the cutover");
    const backLessV1 = await preflight({ query, supported: bodiesB.filter((b) => b !== pair.previous), scope: { workIds: [w1.work_id] } });
    assert.equal(backLessV1.verdict, "refused", `a target WITHOUT ${pair.previous} refuses while W1 is parked on it`);
    assert.ok(backLessV1.outside.some((row) => row.body === pair.previous), "…and the refusal names the body");
    console.log(`[tb-e2e] preflight: target-with-${pair.previous} allowed; target-without-${pair.previous} REFUSED naming it`);

    // --- STOP A. Sequenced, not raced: one leader at a time. ---------------
    imageA.child.kill("SIGTERM");
    await waitExit(imageA.child);
    console.log(`[tb-e2e] build A stopped (exit ${JSON.stringify(imageA.state.exitInfo)}) — W1 is parked on a body no running process now carries`);

    // --- BUILD B. The successor image, this tree's own build. ---------------
    imageB = spawnImage("B", await ephemeralPort(), runtimeServe);
    await waitReady(imageB);
    assert.ok(imageB.state.serving, "build B emitted the provenance boot line");
    assert.match(imageB.state.serving, new RegExp(`claraWork=${pair.pinned}\\b`), `build B pins claraWork to ${pair.pinned}`);
    assert.match(imageB.state.serving, new RegExp(`bodies=${bodiesB.length}\\b`), "…and carries one more body than A");
    // Both bundle banners, byte-identical to their frozen constants, stay on B.
    assert.ok(imageB.state.banners.some((b) => b.id === "clara-work/v1"), "B logs the predecessor bundle banner");
    assert.ok(imageB.state.banners.some((b) => b.id === "clara-work/v2"), "B logs the successor bundle banner");
    v2Digest = imageB.state.banners.find((b) => b.id === "clara-work/v2")?.digest ?? null;
    assert.match(String(v2Digest), /^[0-9a-f]{64}$/, "the successor digest is readable from B's own log");
    console.log(`[tb-e2e] B ready: ${imageB.state.serving}`);

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
    assert.equal(backToA.verdict, "refused", "rolling back to build A REFUSES while W2 is live on the successor");
    assert.ok(backToA.outside.some((row) => row.body === pair.pinned), `…naming ${pair.pinned} as the body A does not carry`);
    assert.equal(backToA.outside.some((row) => row.body === pair.previous), false, "…and NOT naming the predecessor, which A does carry");
    console.log(`[tb-e2e] preflight: rollback to A REFUSED, naming ${pair.pinned}`);

    // --- RESUME W1 on its ORIGINAL body, inside build B --------------------
    // The bare clarify's own door. B carries the predecessor body, so the hook resumes into it.
    await rig.humanQuery(ctxA.owner, "select clara.answer_interruption(p_id=>$1, p_answer=>$2::jsonb, p_op_key=>$3)", [
      q1.id,
      JSON.stringify(ANSWER),
      `tb-w1-${randomUUID()}`,
    ]);
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
    assert.equal(drained.verdict, "allowed", "with BOTH Works terminal, the SAME build-A target now ALLOWS — the inventory tracks live state, not a snapshot");
    console.log("[tb-e2e] preflight: with both Works settled, rollback to A is now ALLOWED");

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
      assert.equal(noClaraWork.verdict, "refused", "a target with NO claraWork body refuses on the unbound task ALONE");
      assert.deepEqual(noClaraWork.outside, [], "…and it is not a workflow-run refusal: there is no run to be outside anything");
      assert.ok(noClaraWork.reasons.includes("unbound_accounting_work"), `…the reason is its own (got ${JSON.stringify(noClaraWork.reasons)})`);
      const withClaraWork = await preflight({ query, supported: bodiesA, scope: { workIds: [orphan.work_id] } });
      assert.equal(withClaraWork.verdict, "allowed", "a target that carries ANY claraWork body can run it — an unbound task has not chosen a version yet");
      console.log("[tb-e2e] unbound Work: refuses on its own against a claraWork-less target; allowed against build A");
    } finally {
      // CANCELLED, never deleted: clara.agent_tasks refuses a DELETE (CLR08) and
      // clara.accounting_work is immutable by trigger.
      await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [orphan.task_id]);
    }
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
