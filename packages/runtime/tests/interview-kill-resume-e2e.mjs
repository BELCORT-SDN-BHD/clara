// STANDALONE kill-mid-interview → durable-resume e2e (Wave B, GATE 3(c) — doubles as a
// live-gate-O rehearsal). NOT a `node --test` file: it SPAWNS scripts/serve.mjs as a CHILD
// process (the shutdown-e2e.mjs + relay-runner SIGKILL/respawn pattern) so the ENGINE process
// can be hard-killed mid-park and respawned against the SAME DB. Run:
//
//   PGHOST=127.0.0.1 PGPORT=55440 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55440/clara_rt_test \
//   node tests/interview-kill-resume-e2e.mjs
//
// Proves the durable spine (spike finding 2 / T6): a client interview parked on a WDK hook,
// with ≥2 answered plan checkpoints, survives a SIGKILL of the engine process — a respawn on
// the same DB re-parks at the SAME park index with byte-identical answered items (idempotent
// update_onboarding_plan op_keys, exactly-once across the kill), then drives to completion.
//
// This file is Linux/Fly-shaped and slow. It is gated behind CLARA_SKIP_KILL_RESUME=1 (the
// heavy-test opt-out, the relay-runner precedent) and needs a BUILT server (pnpm build) + the
// rig DB (17 migrations + 0002 seed + the WDK world bootstrap) + WORKFLOW_POSTGRES_URL at it.
//
// WINDOWS: SIGKILL hard-kills on win32 too (shutdown-e2e confirms only SIGTERM is uncatchable
// there); the asserted resume property is DB-driven boot re-enqueue, which is platform-neutral.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

if (process.env.CLARA_SKIP_KILL_RESUME === "1") {
  console.log("[kill-resume] skipped (CLARA_SKIP_KILL_RESUME=1)");
  process.exit(0);
}

// --- Fail-closed local gate (the intake-e2e precedent).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("interview-kill-resume-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("interview-kill-resume-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}

const PORT = process.env.INTERVIEW_KILL_PORT || "3216";
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = "https://clara-interview-kr.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "ivkr-" + randomUUID().replace(/-/g, "");
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveScript = fileURLToPath(new URL("../scripts/serve.mjs", import.meta.url));

const mint = (sub) =>
  new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD).setIssuedAt().setExpirationTime("15m").sign(key);

// The child inherits the DB env + a stable JWT config so parent-minted tokens validate.
const childEnv = () => ({
  ...process.env,
  PORT,
  RELAY_TEST_MODE: "1",
  CLARA_START_WORLD: "1",
  WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
  SUPABASE_JWT_ISSUER: ISSUER,
  SUPABASE_JWT_AUD: AUD,
  SUPABASE_JWT_SECRET: jwtSecret,
});

function spawnServe() {
  const child = spawn(process.execPath, [serveScript], { env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, exitInfo: null };
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.exitInfo = { code, signal };
  });
  // Surface child stderr on failure paths (kept quiet otherwise).
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    if (/FATAL|Error:/.test(d)) process.stderr.write(`[child] ${d}`);
  });
  return { child, state };
}

function waitExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => reject(new Error("timeout waiting for serve child exit")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function waitReady(deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  let healthy = false;
  while (Date.now() < end) {
    try {
      if (!healthy && (await fetch(`${BASE}/health`)).ok) healthy = true;
      if (healthy) {
        const r = await fetch(`${BASE}/ready`);
        if (r.status === 200) return;
      }
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error("serve child did not become ready (/health + /ready 200)");
}

async function postJson(path, body, jwt) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed };
}

async function getState({ runId, planId }, jwt) {
  const url = new URL(`${BASE}/api/interview/state`);
  if (runId) url.searchParams.set("runId", runId);
  url.searchParams.set("scope", "client");
  if (planId) url.searchParams.set("planId", planId);
  const r = await fetch(url, { headers: { authorization: `Bearer ${jwt}` } });
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body };
}

async function pollState(args, jwt, pred, label, deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    const s = await getState(args, jwt);
    last = s;
    if (s.status === 200 && pred(s.body)) return s.body;
    await sleep(200);
  }
  throw new Error(`pollState timeout (${label}); last=${JSON.stringify(last)}`);
}

const VALID_CLIENT = {
  legal_name: "Acme Trading SB", entity_type: "sdn_bhd", ssm: "202401001234-K", tin: "C2584563222", msic: "46900",
  sst_regime: "service_tax", sst_no: "skip", statutory: "skip", banks: "skip", currency: "MYR", fye: "6",
  framework: "MPERS", coa_seed: "yes", opening_position: "new_first_year", fa_depreciation: "no",
  turnover: "RM1M-5M", sample_invoices: "skip",
};

/** Answer parks until `targetConfirms` segments have been CONFIRMED, then STOP parked at the next
 *  fresh 'q'. Returns the /state body parked at that next question. */
async function driveUntilConfirms({ runId, planId }, jwt, targetConfirms, deadlineMs = 60000) {
  const answered = new Set();
  let confirms = 0;
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    const s = await getState({ runId, planId }, jwt);
    if (s.status !== 200) {
      await sleep(150);
      continue;
    }
    if (s.body.terminal) throw new Error("reached terminal before the target confirm count");
    const pp = s.body.pending_park;
    if (!pp) {
      await sleep(120);
      continue;
    }
    if (confirms >= targetConfirms && pp.phase === "q" && !answered.has(pp.parkIndex)) return s.body;
    if (answered.has(pp.parkIndex)) {
      await sleep(120);
      continue;
    }
    const value = pp.phase === "c" ? "yes" : VALID_CLIENT[pp.seg];
    const res = await postJson("/api/interview/answer", { runId, scope: "client", parkIndex: pp.parkIndex, planId, value }, jwt);
    if (res.status === 200) {
      answered.add(pp.parkIndex);
      if (pp.phase === "c") confirms += 1;
    } else if (res.status !== 409) {
      throw new Error(`answer failed at park ${pp.parkIndex} (${pp.seg}/${pp.phase}): ${res.status} ${JSON.stringify(res.body)}`);
    }
    await sleep(60);
  }
  throw new Error("driveUntilConfirms: did not reach the target confirm count");
}

async function driveToComplete({ runId, planId }, jwt, deadlineMs = 90000) {
  const answered = new Set();
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    const s = await getState({ runId, planId }, jwt);
    if (s.status !== 200) {
      await sleep(150);
      continue;
    }
    last = s.body;
    if (s.body.terminal) return s.body;
    const pp = s.body.pending_park;
    if (!pp || answered.has(pp.parkIndex)) {
      await sleep(120);
      continue;
    }
    const value = pp.phase === "c" ? "yes" : VALID_CLIENT[pp.seg];
    const res = await postJson("/api/interview/answer", { runId, scope: "client", parkIndex: pp.parkIndex, planId, value }, jwt);
    if (res.status === 200) answered.add(pp.parkIndex);
    else if (res.status !== 409) throw new Error(`answer failed at park ${pp.parkIndex}: ${res.status} ${JSON.stringify(res.body)}`);
    await sleep(60);
  }
  throw new Error(`driveToComplete: no terminal; last=${JSON.stringify(last)}`);
}

/** A stable fingerprint of the answered business items (order-independent, answer-value aware). */
function fingerprintItems(items) {
  return items
    .filter((it) => it.item_key !== "interview_run")
    .map((it) => `${it.item_key}:${it.state}:${JSON.stringify(it.answer)}`)
    .sort();
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  // ----- birth the plan + start the interview against the FIRST engine process -----
  const { owner } = await rig.buildFirm("iv-kill");
  const { clientId, planId } = await rig.beginClientOnboarding({ ownerSub: owner, name: `iv kill ${Date.now()}` });
  const jwt = await mint(owner);

  const first = spawnServe();
  let killedFirst = false;
  try {
    await waitReady();
    console.log("[kill-resume] first engine ready");

    const start = await postJson("/api/interview/client/start", { clientId, planId }, jwt);
    assert.equal(start.status, 202, `client/start 202 (got ${start.status} ${JSON.stringify(start.body)})`);
    const runId = start.body.run_id;
    assert.ok(runId, "run id returned");

    // Answer the first 2 segments fully → ≥2 durable answered plan checkpoints; STOP parked at
    // the NEXT question (parkIndex advanced, prompt not consumed).
    const parkedBefore = await driveUntilConfirms({ runId, planId }, jwt, 2);
    const parkIndexBefore = parkedBefore.pending_park.parkIndex;
    assert.ok(parkIndexBefore >= 4, `parked past the first 2 segments' q+c parks (parkIndex ${parkIndexBefore} ≥ 4)`);

    const itemsBefore = await rig.readOnboardingPlanItems(planId);
    const businessBefore = itemsBefore.filter((it) => it.item_key !== "interview_run");
    assert.ok(businessBefore.length >= 2, `≥2 answered business items persisted before the kill (got ${businessBefore.length})`);
    const planBefore = await rig.readOnboardingPlan(planId);
    const fpBefore = fingerprintItems(itemsBefore);

    // ----- SIGKILL the engine mid-park -----
    first.child.kill("SIGKILL");
    killedFirst = true;
    await waitExit(first.child, 10000);
    console.log("[kill-resume] first engine SIGKILLed mid-park");

    const runAfterKill = await rig.readWorkflowRun(runId);
    assert.ok(runAfterKill, "the run row survives the kill");
    assert.ok(!["completed", "failed", "cancelled"].includes(runAfterKill.status), `the run is left NON-TERMINAL (got ${runAfterKill.status})`);
    await sleep(400); // let the backend detect the drop + release any locks

    // ----- respawn on the SAME DB -----
    const second = spawnServe();
    try {
      await waitReady();
      console.log("[kill-resume] second engine ready (same DB)");

      // Still parked at the SAME park index, status 'running' (a parked run reports running).
      const parkedAfter = await pollState({ runId, planId }, jwt, (b) => b.pending_park?.parkIndex === parkIndexBefore, "re-park at same index");
      assert.equal(parkedAfter.pending_park.parkIndex, parkIndexBefore, "re-parked at the SAME park index (not advanced)");
      assert.equal(parkedAfter.status, "running", "the resumed run is running (parked), not terminal");

      // Byte-identical answered checkpoints — same count, same values, same revision_n; no dupes.
      const itemsAfter = await rig.readOnboardingPlanItems(planId);
      assert.deepEqual(fingerprintItems(itemsAfter), fpBefore, "answered items are byte-identical across the kill (no answer re-applied)");
      const keysAfter = itemsAfter.map((it) => it.item_key);
      assert.equal(new Set(keysAfter).size, keysAfter.length, "ZERO duplicate item_key after resume");
      const planAfter = await rig.readOnboardingPlan(planId);
      assert.equal(Number(planAfter.revision_n), Number(planBefore.revision_n), "revision_n unchanged across the kill (memoized op_keys are idempotent)");

      // ----- drive the remaining segments to completion (exactly-once across the kill) -----
      const terminal = await driveToComplete({ runId, planId }, jwt);
      assert.equal(terminal.status, "complete", `resumed drive completes (got ${terminal.status})`);
      assert.equal(terminal.terminal.outcome, "interview_complete", "typed complete terminal after resume");
      assert.equal(Number(terminal.terminal.answered), 13, `total answered equals the single-process count (13); got ${terminal.terminal.answered}`);

      const itemsFinal = await rig.readOnboardingPlanItems(planId);
      const keysFinal = itemsFinal.map((it) => it.item_key);
      assert.equal(new Set(keysFinal).size, keysFinal.length, "each item_key appears EXACTLY once (exactly-once across the kill)");
      assert.equal(itemsFinal.filter((it) => it.item_key !== "interview_run").length, 13, "13 business items total after the resumed drive");
      assert.equal(itemsFinal.filter((it) => it.item_key === "interview_run").length, 1, "the interview_run binding is still present exactly once");

      console.log("[kill-resume] PASS: SIGKILL mid-park → same-index re-park, byte-identical checkpoints, exactly-once drive to complete");
    } finally {
      if (!second.state.exited) second.child.kill("SIGKILL");
    }
  } finally {
    if (!killedFirst && !first.state.exited) first.child.kill("SIGKILL");
  }

  console.log("\nINTERVIEW KILL-RESUME E2E: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nINTERVIEW KILL-RESUME E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
