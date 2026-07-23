// STANDALONE interview cancellation + drive-to-complete e2e (Wave B, GATE 3 — the
// rig-confined fault gate). NOT a `node --test` file: it boots the built server + the
// real WDK Postgres world IN-PROCESS (the world-e2e.mjs pattern) and drives a REAL
// begin_client_onboarding-born interview through the REAL clientOnboarding_v1 /
// firmInterview_v1 workflows over HTTP, so it owns its lifecycle and exits explicitly.
// Run (against a disposable local DB named in the ENVIRONMENT):
//
//   PGHOST=127.0.0.1 PGPORT=55440 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55440/clara_rt_test \
//   node tests/interview-e2e.mjs
//
// It closes the audited GATE-3 gaps: no existing test drove a REAL onboarding interview
// through the REAL WDK engine — cancel/expire were only unit-stubbed. Covers:
//   (a)       client onboarding cancel at the first park → typed 'cancelled' terminal, no
//             business plan item persisted (only the interview_run binding), plan stays open.
//   (a-firm)  pre-firm bootstrap cancel → 'cancelled', firmId/planId absent, NO firm/plan born;
//             the F1 bind-before-resume refusal (a different sub → 404).
//   (positive) the real engine drives a full 13-segment client interview to the typed
//             'interview_complete' terminal — the missing e2e baseline (cancel/kill are then
//             the ONLY non-complete terminals).
//
// The Gate-3(b) EXPIRY sub-scenario is DELIBERATELY OMITTED: expiry has no production
// mechanism this wave (it rides the cancel verb; no ambient timer), so a real-deadline
// drive is a stop_item pending an owner ruling and a stubbed {kind:'expired'} injection is
// forbidden. Operational expiry today IS cancel — covered end-to-end by (a)/(a-firm).
//
// Requires a BUILT server (.output/server/index.mjs → pnpm build) + the rig DB (all 17
// migrations + the 0002 core seed + the WDK world bootstrap) + WORKFLOW_POSTGRES_URL at
// that SAME DB (the workflow schema lives there; rig readers query workflow.workflow_runs).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

// --- Fail-closed local gate (the intake-e2e precedent). Any PGPORT is accepted (local
// 55440, CI's 5432 service), but the host MUST be loopback and the database MUST be a
// sanctioned throwaway — never a live/remote target. Local rig uses clara_rt_test; CI
// provisions a fresh clara_interview_ci for this e2e.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("interview-e2e is hard-gated to a loopback host (127.0.0.1|localhost) + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("interview-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1"; // explicit opt-in — this IS a world test
process.env.PORT ||= "3214";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
const ISSUER = "https://clara-interview.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "iv-" + randomUUID().replace(/-/g, "");
process.env.SUPABASE_JWT_ISSUER = ISSUER;
process.env.SUPABASE_JWT_AUD = AUD;
process.env.SUPABASE_JWT_SECRET = jwtSecret;

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mint = (sub) =>
  new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD).setIssuedAt().setExpirationTime("15m").sign(key);

async function waitHealthy(deadlineMs = 20000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("server did not become healthy");
}

// --- HTTP helpers (typed on the §3.1 interview surface) ---------------------

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

async function getState({ runId, scope, planId }, jwt) {
  const url = new URL(`${BASE}/api/interview/state`);
  if (runId) url.searchParams.set("runId", runId);
  url.searchParams.set("scope", scope);
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

/** Poll GET /state until pred(body) — tolerating the early 404s the route returns while the
 *  run has not yet streamed its owner marker / interview_run binding (bind-before-read, F1). */
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

async function pollRunTerminal(rig, runId, label, deadlineMs = 20000) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    last = await rig.readWorkflowRun(runId);
    if (last && ["completed", "failed", "cancelled"].includes(last.status)) return last;
    await sleep(150);
  }
  throw new Error(`pollRunTerminal timeout (${label}); last=${JSON.stringify(last)}`);
}

// The valid scripted-answer map, reused verbatim from wave-b-interview-client.test.mjs
// (the closure suite's FORK-3 drive). 'skip' entries exercise the skippable segments.
const VALID_CLIENT = {
  legal_name: "Acme Trading SB", entity_type: "sdn_bhd", ssm: "202401001234-K", tin: "C2584563222", msic: "46900",
  sst_regime: "service_tax", sst_no: "skip", statutory: "skip", banks: "skip", currency: "MYR", fye: "6",
  framework: "MPERS", coa_seed: "yes", opening_position: "new_first_year", fa_depreciation: "no",
  turnover: "RM1M-5M", sample_invoices: "skip",
};

/** Drive a CLIENT interview to its terminal by answering each open park: a 'q' park gets the
 *  scripted value (VALID_CLIENT[seg]); a 'c' confirm park gets 'yes'. Returns the terminal /state. */
async function driveClientToComplete({ runId, planId }, jwt, deadlineMs = 90000) {
  const answered = new Set();
  const end = Date.now() + deadlineMs;
  let lastBody = null;
  while (Date.now() < end) {
    const s = await getState({ runId, scope: "client", planId }, jwt);
    if (s.status !== 200) {
      await sleep(150);
      continue;
    }
    lastBody = s.body;
    if (s.body.terminal) return s.body;
    const pp = s.body.pending_park;
    if (!pp || answered.has(pp.parkIndex)) {
      await sleep(120);
      continue;
    }
    const value = pp.phase === "c" ? "yes" : VALID_CLIENT[pp.seg];
    if (pp.phase === "q" && value === undefined) throw new Error(`no scripted answer for segment '${pp.seg}'`);
    const res = await postJson("/api/interview/answer", { runId, scope: "client", parkIndex: pp.parkIndex, planId, value }, jwt);
    if (res.status === 200) answered.add(pp.parkIndex);
    else if (res.status !== 409) throw new Error(`answer failed at park ${pp.parkIndex} (${pp.seg}/${pp.phase}): ${res.status} ${JSON.stringify(res.body)}`);
    await sleep(60);
  }
  throw new Error(`driveClientToComplete: no terminal within ${deadlineMs}ms; last=${JSON.stringify(lastBody)}`);
}

async function main() {
  const rig = await import("./rig.mjs");
  const { containsSecretShape } = await import("./wave-b-interview-testkit.mjs");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  // Boot the built server (HTTP + world + control + leader + all loops) in THIS process.
  await import("../.output/server/index.mjs");
  await waitHealthy();
  console.log("[interview-e2e] server healthy + world started");

  // -------------------------------------------------------------------------
  // (a) client onboarding: REAL cancel at the first park → typed 'cancelled' terminal.
  // -------------------------------------------------------------------------
  {
    const { owner } = await rig.buildFirm("iv-client-cancel");
    const { clientId, planId } = await rig.beginClientOnboarding({ ownerSub: owner, name: `iv cancel ${Date.now()}` });
    const jwt = await mint(owner);
    const plan0 = await rig.readOnboardingPlan(planId);
    assert.equal(plan0.state, "open", "the begin_client_onboarding plan starts open");

    const start = await postJson("/api/interview/client/start", { clientId, planId }, jwt);
    assert.equal(start.status, 202, `client/start admitted 202 (got ${start.status} ${JSON.stringify(start.body)})`);
    assert.equal(start.body.scope, "client");
    const runId = start.body.run_id;
    assert.ok(runId, "a run id was returned");

    // Wait until the run is GENUINELY parked on its first hook (park index 0 streamed).
    await pollState({ runId, scope: "client", planId }, jwt, (b) => b.pending_park?.parkIndex === 0, "client parks at index 0");

    const cancel = await postJson("/api/interview/cancel", { runId, scope: "client", parkIndex: 0, planId }, jwt);
    assert.equal(cancel.status, 200, `cancel → 200 (got ${cancel.status} ${JSON.stringify(cancel.body)})`);
    assert.equal(cancel.body.ok, true, "cancel body {ok:true}");

    const terminalState = await pollState({ runId, scope: "client", planId }, jwt, (b) => b.status === "cancelled" && b.terminal?.outcome === "cancelled", "client cancel terminal");
    assert.equal(terminalState.status, "cancelled");
    assert.equal(terminalState.terminal.outcome, "cancelled", "the streamed terminal marker is authoritative (a cancel returns normally)");

    const run = await pollRunTerminal(rig, runId, "client cancel run settles");
    assert.ok(["completed", "failed", "cancelled"].includes(run.status), `engine run is TERMINAL not running (got ${run.status})`);

    // No business plan item persisted — ONLY the interview_run binding (written before the
    // first question, so we assert on item_key != 'interview_run', NEVER literal-zero).
    const items = await rig.readOnboardingPlanItems(planId);
    const business = items.filter((it) => it.item_key !== "interview_run");
    assert.equal(business.length, 0, `no business segment persisted on cancel (got ${JSON.stringify(business.map((b) => b.item_key))})`);
    assert.equal(items.filter((it) => it.item_key === "interview_run").length, 1, "the run-binding capture item exists exactly once");

    const plan1 = await rig.readOnboardingPlan(planId);
    assert.equal(plan1.state, "open", "the interview cancel persists nothing flawed — the plan stays open (cancel_client_onboarding is a separate human follow-on)");

    assert.equal(containsSecretShape(terminalState), false, "P19: no secret-shaped key anywhere in the /state body");
    console.log("[interview-e2e] PASS (a): client cancel → typed cancelled terminal, no business item, plan stays open");
  }

  // -------------------------------------------------------------------------
  // (a-firm) pre-firm bootstrap: REAL cancel → cancelled, NO firm/plan born.
  // -------------------------------------------------------------------------
  {
    const preFirmSub = await rig.insertUser("iv-prefirm", randomUUID().slice(0, 8));
    const jwt = await mint(preFirmSub);

    const start = await postJson("/api/interview/firm/start", {}, jwt);
    assert.equal(start.status, 202, `firm/start admitted 202 for a pre-firm principal (got ${start.status} ${JSON.stringify(start.body)})`);
    assert.equal(start.body.scope, "firm");
    const runId = start.body.run_id;
    assert.ok(runId, "a firm run id was returned");

    await pollState({ runId, scope: "firm" }, jwt, (b) => b.pending_park?.parkIndex === 0, "firm parks at index 0");

    // F1 bind-before-resume: a DIFFERENT sub's cancel on the same runId is an indistinguishable
    // 404 (firmOwnerMatches refuses — the owner marker's principalUserId must equal the caller).
    const otherSub = await rig.insertUser("iv-other", randomUUID().slice(0, 8));
    const otherJwt = await mint(otherSub);
    const forged = await postJson("/api/interview/cancel", { runId, scope: "firm", parkIndex: 0 }, otherJwt);
    assert.equal(forged.status, 404, `F1: a foreign sub's cancel is a 404 not_found (got ${forged.status})`);

    const cancel = await postJson("/api/interview/cancel", { runId, scope: "firm", parkIndex: 0 }, jwt);
    assert.equal(cancel.status, 200, `firm cancel → 200 (got ${cancel.status} ${JSON.stringify(cancel.body)})`);

    const terminalState = await pollState({ runId, scope: "firm" }, jwt, (b) => b.status === "cancelled" && b.terminal?.outcome === "cancelled", "firm cancel terminal");
    assert.equal(terminalState.terminal.outcome, "cancelled");
    // firmInterview_v1 never reached create_firm — the terminal carries no firm/plan id.
    // (FINDING: the cancel branch streams only {outcome, answered}; firmId/planId are ABSENT,
    // i.e. undefined, not the design's literal null — asserted via == null, honest for both.)
    assert.ok(terminalState.terminal.firmId == null, "no firmId in the cancel terminal (never created)");
    assert.ok(terminalState.terminal.planId == null, "no planId in the cancel terminal (never created)");

    // No firm/plan attributable to the run: the caller is STILL pre-firm.
    const principal = await rig.asRuntime((c) => c.query("select firm_id from clara.resolve_chat_principal($1)", [preFirmSub]));
    assert.ok(principal.rows[0]?.firm_id == null, "resolve_chat_principal still returns NO firm — no firm was born");
    const restart = await postJson("/api/interview/firm/start", {}, jwt);
    assert.equal(restart.status, 202, "a second firm/start again returns 202 (still pre-firm) — no firm/plan created by the cancelled run");

    assert.equal(containsSecretShape(terminalState), false, "P19: no secret-shaped key in the firm /state body");
    console.log("[interview-e2e] PASS (a-firm): pre-firm cancel → cancelled terminal, no firm/plan, F1 foreign-cancel 404");
  }

  // -------------------------------------------------------------------------
  // (positive control) the real engine drives a full client interview to complete.
  // -------------------------------------------------------------------------
  {
    const { owner } = await rig.buildFirm("iv-client-complete");
    const { clientId, planId } = await rig.beginClientOnboarding({ ownerSub: owner, name: `iv complete ${Date.now()}` });
    const jwt = await mint(owner);
    const plan0 = await rig.readOnboardingPlan(planId);
    const n0 = Number(plan0.revision_n);

    const start = await postJson("/api/interview/client/start", { clientId, planId }, jwt);
    assert.equal(start.status, 202, `client/start admitted 202 (got ${start.status} ${JSON.stringify(start.body)})`);
    const runId = start.body.run_id;

    const terminalState = await driveClientToComplete({ runId, planId }, jwt);
    assert.equal(terminalState.status, "complete", `full drive → complete (got ${terminalState.status})`);
    assert.equal(terminalState.terminal.outcome, "interview_complete", "typed complete terminal");
    assert.equal(Number(terminalState.terminal.answered), 13, `13 client segments answered (4 skippables skipped); got ${terminalState.terminal.answered}`);

    // Plan items: one answered item per must_ask/capture segment; the AMB-11 opening key present;
    // the interview_run binding EXACTLY once; ZERO duplicate item_key values.
    const items = await rig.readOnboardingPlanItems(planId);
    const keys = items.map((it) => it.item_key);
    assert.equal(new Set(keys).size, keys.length, `no duplicate item_key (got ${JSON.stringify(keys)})`);
    assert.equal(items.filter((it) => it.item_key === "interview_run").length, 1, "the interview_run binding is present exactly once");
    assert.ok(keys.includes("first_year_zero_opening"), "the AMB-11 new-first-year opening item key is present");
    const business = items.filter((it) => it.item_key !== "interview_run");
    assert.equal(business.length, 13, `13 business items persisted (one per answered segment); got ${business.length}`);
    for (const it of business) assert.equal(it.state, "answered", `segment item ${it.item_key} is answered`);

    // onboarding_plans.revision_n advanced monotonically — one update_onboarding_plan CAS per
    // confirmed segment (13) plus the interview_run binding write (1). No CLR04/CLR06 surfaced to
    // the route (each answer was DB-revalidated as bookkeeper+ — proven by the drive succeeding).
    const planF = await rig.readOnboardingPlan(planId);
    assert.ok(Number(planF.revision_n) >= n0 + 14, `revision advanced ≥ +14 (bind + 13 answers); n0=${n0} nF=${planF.revision_n}`);
    assert.equal(planF.state, "open", "the plan stays open post-interview (commit_client_onboarding is the separate human ceremony)");

    console.log("[interview-e2e] PASS (positive): full 13-segment drive → interview_complete, 13 items, no dupes, revision advanced");
  }

  console.log("\nINTERVIEW E2E: ALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nINTERVIEW E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
