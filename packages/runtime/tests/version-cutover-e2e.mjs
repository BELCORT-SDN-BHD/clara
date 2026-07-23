// STANDALONE v25 version-cutover + rollback-preflight e2e (Wave B, GATE 7 — the
// rig-confined fault gate). NOT a `node --test` file: it boots the built server + the real
// WDK Postgres world IN-PROCESS (the world-e2e.mjs §2 clarify-park pattern), stages a parked
// run on the RETAINED OLD version chatTurn_v6, cuts a second turn over to chatTurn_v7
// (workflows.chatTurn, through the registry indirection), proves the parked v6 run
// resumes+completes on its ORIGINAL body (name-column invariance — the Slice-0 T6 evidence),
// and turns the WB-R18 runbook rollback-preflight SQL into executable coverage. Run:
//
//   PGHOST=127.0.0.1 PGPORT=55440 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55440/clara_rt_test \
//   node tests/version-cutover-e2e.mjs
//
// It closes an audited GATE-7 gap: the v25 rollback preflight existed ONLY as a manual
// runbook SQL step (docs/ops/wave-b-ceremony-runbook.md lines 18/87, run live in WB-R18) + a
// static freeze-lint — never an executable rig test with parked runs across a version cutover.
//
// Reference note (recorded deviation): a standalone plain-node e2e cannot DIRECT-import the
// frozen chatTurn_v6 "use workflow" proxy — the workflowId-bearing proxy is produced by the
// nitro/WDK build transform (unavailable under tsx or plain node), and the built proxy is not
// separately importable from the server bundle. The WDK-native equivalent is start({ workflowId
// }) — the exact shape the engine's OWN boot re-enqueue uses (@workflow/core runtime runs.js).
// So we reference v6 by its build-manifest workflowId, and GUARD-assert the STARTED run's
// workflow.workflow_runs.name really is a chatTurn_v6 body (deriving the name from the ROW, never
// hardcoding the WDK path+export format) — a wrong reference fails loud, never false-greens.
//
// Requires a BUILT server (.output/server/index.mjs → pnpm build) + the rig DB (17 migrations +
// 0002 seed + the WDK world bootstrap) + WORKFLOW_POSTGRES_URL at that SAME DB.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";

// --- Fail-closed local gate (the intake-e2e precedent).
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("version-cutover-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|wave_b_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("version-cutover-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|wave_b_ci)");
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1";
process.env.PORT ||= "3215";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
// Lengthen the reconciler grace far beyond the test window so the leader loop can never
// re-enqueue the unbound T6 on workflows.chatTurn (v7) mid-test — start(v6) is the sole starter.
process.env.CLARA_RECONCILE_GRACE ||= "30 minutes";
const ISSUER = "https://clara-cutover.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "cut-" + randomUUID().replace(/-/g, "");
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
      /* not up */
    }
    await sleep(200);
  }
  throw new Error("server did not become healthy");
}

async function pollTask(rig, taskId, pred, label, deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    last = await rig.readTask(taskId);
    if (last && pred(last)) return last;
    await sleep(200);
  }
  throw new Error(`pollTask timeout (${label}); last=${JSON.stringify(last)}`);
}

async function pollRun(rig, runId, pred, label, deadlineMs = 20000) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    last = await rig.readWorkflowRun(runId);
    if (last && pred(last)) return last;
    await sleep(150);
  }
  throw new Error(`pollRun timeout (${label}); last=${JSON.stringify(last)}`);
}

/** Look up a workflow's build-manifest workflowId (the ONLY non-row reference we need — used to
 *  START a specific retained version and to name the zero-run control; every ASSERTION derives
 *  the name from the run ROW instead). Reads the nitro build artifact, never a hardcoded literal. */
async function manifestWorkflowId(fileNeedle, exportName) {
  const url = new URL("../node_modules/.nitro/workflow/manifest.json", import.meta.url);
  const m = JSON.parse(await readFile(url, "utf8"));
  for (const [file, exps] of Object.entries(m.workflows ?? {})) {
    if (file.includes(fileNeedle) && exps?.[exportName]?.workflowId) return exps[exportName].workflowId;
  }
  throw new Error(`manifest has no workflowId for ${exportName} in ${fileNeedle}`);
}

/** The runbook §0/§8 preflight, executable: a version is rollback-'allowed' iff it has ZERO
 *  non-terminal runs (docs/ops/wave-b-ceremony-runbook.md lines 18/87). */
async function rollbackPreflight(rig, name) {
  const r = await rig.rootQuery(
    "select count(*)::int n from workflow.workflow_runs where name=$1 and status not in ('completed','failed','cancelled')",
    [name],
  );
  return Number(r.rows[0].n) === 0 ? "allowed" : "refused";
}

async function answerClarify(rig, taskId, ownerSub, answerText, opKey) {
  const inter = await rig.rootQuery("select id from clara.agent_interruptions where task_id=$1 and status='pending'", [taskId]);
  assert.equal(inter.rowCount, 1, `exactly one pending clarify for task ${taskId}`);
  await rig.humanQuery(ownerSub, "select clara.answer_interruption(p_id=>$1, p_answer=>$2::jsonb, p_op_key=>$3)", [
    inter.rows[0].id,
    JSON.stringify({ type: "text", text: answerText }),
    opKey,
  ]);
}

async function main() {
  const rig = await import("./rig.mjs");
  const { mockClarifyThenTextModel } = await import("./mockModel.mjs");
  const { start } = await import("workflow/api");
  if (!(await rig.runtimeReady())) throw new Error("the 0006 runtime surface is absent — migrate the target first");

  // A model that clarifies once then answers with text — parks on the clarify hook, then
  // completes on resume (deterministic across a WDK replay; no network, no key).
  globalThis.__claraModelForTest = mockClarifyThenTextModel("Which client is this for?", "thanks — noted");

  await import("../.output/server/index.mjs");
  await waitHealthy();
  console.log("[cutover-e2e] server healthy + world started");

  const v6ManifestName = await manifestWorkflowId("chatTurn.v6.ts", "chatTurn_v6");
  const closeExampleName = await manifestWorkflowId("closeExample.v1.ts", "closeExampleV1");

  const { owner, client } = await rig.buildFirm("cutover");
  const jwt = await mint(owner);

  // -------------------------------------------------------------------------
  // CUTOVER: a NEW admission targets the newest version (v7) through the registry
  // indirection — the HTTP /turns route calls start(workflows.chatTurn) = chatTurn_v7.
  // -------------------------------------------------------------------------
  const s7 = await rig.createChatSession({ author: owner, client });
  const turnRes = await fetch(`${BASE}/api/chat/${s7}/turns`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ turnKey: "cutover-v7", parts: [{ type: "text", text: "help please" }] }),
  });
  assert.equal(turnRes.status, 202, "v7 turn admitted 202");
  const t7 = (await turnRes.json()).task_id;
  const t7Parked = await pollTask(rig, t7, (t) => t.status === "awaiting_input", "T7 parks on clarify");
  const v7RowName = (await rig.readWorkflowRun(t7Parked.workflow_run_id)).name;
  assert.match(v7RowName, /chatTurn\.v7|chatTurn_v7/, `new admission bound the NEWEST version v7 (row name ${v7RowName})`);
  console.log(`[cutover-e2e] CUTOVER: new admission → v7 (${v7RowName})`);

  // -------------------------------------------------------------------------
  // A parked run on the RETAINED OLD version (chatTurn_v6): admit unbound via
  // rig.beginChatTurn (NOT the HTTP route — that would auto-start v7), then start v6 in the
  // same tick so its claimRunStep CAS binds v6 before anything else.
  // -------------------------------------------------------------------------
  const s6 = await rig.createChatSession({ author: owner, client });
  const t6Receipt = await rig.beginChatTurn({ session: s6, author: owner, turnKey: "cutover-v6", parts: [{ type: "text", text: "help please" }] });
  const t6 = t6Receipt.task_id;
  await start({ workflowId: v6ManifestName }, [{ taskId: t6 }]);
  const t6Parked = await pollTask(rig, t6, (t) => t.status === "awaiting_input", "T6 parks on clarify (v6)");
  const v6RowName = (await rig.readWorkflowRun(t6Parked.workflow_run_id)).name;
  // GUARD: prove v6 (not a reconciler-raced v7) actually bound — fail loud so the race never false-greens.
  assert.match(v6RowName, /chatTurn\.v6|chatTurn_v6/, `GUARD: the parked run bound chatTurn_v6, not v7 (row name ${v6RowName})`);
  assert.notEqual(v6RowName, v7RowName, "the v6 run and the v7 run carry DISTINCT body names");
  console.log(`[cutover-e2e] parked v6 run staged (${v6RowName})`);

  // -------------------------------------------------------------------------
  // ROLLBACK PREFLIGHT (executable): both parked → both REFUSED.
  // -------------------------------------------------------------------------
  assert.equal(await rollbackPreflight(rig, v6RowName), "refused", "v6 has a non-terminal run → rollback refused");
  assert.equal(await rollbackPreflight(rig, v7RowName), "refused", "v7 has a non-terminal run → rollback refused");
  // The zero-run control (asserted directly, not inferred): a registered-but-unused version passes.
  assert.equal(await rollbackPreflight(rig, closeExampleName), "allowed", "a workflow with ZERO runs → rollback allowed");
  console.log("[cutover-e2e] preflight: v6 refused, v7 refused, closeExample (zero-run) allowed");

  // -------------------------------------------------------------------------
  // RESUME v6 on its ORIGINAL body → completes; the name column NEVER migrates to v7.
  // -------------------------------------------------------------------------
  await answerClarify(rig, t6, owner, "Acme Sdn Bhd", "cutover-ans-v6");
  const t6Done = await pollTask(rig, t6, (t) => ["completed", "failed", "cancelled"].includes(t.status), "T6 settles", 40000);
  assert.equal(t6Done.status, "completed", `the parked v6 run completed (got ${t6Done.status}/${t6Done.error_code})`);
  assert.equal(t6Done.error_code, null, "v6 completed with no error_code");
  const v6RunAfter = await pollRun(rig, t6Parked.workflow_run_id, (r) => ["completed", "failed", "cancelled"].includes(r.status), "v6 run terminal");
  // PIN: the name column is INVARIANT — the retained v6 body completed the run, never migrated.
  assert.equal(v6RunAfter.name, v6RowName, "PIN: the run's name column stayed chatTurn_v6 across completion (never migrated to v7)");
  assert.equal(v6RunAfter.status, "completed", "the v6 run is completed");

  // v6 is now retirable (zero non-terminal v6 runs); v7 STILL has its parked run → still refused.
  assert.equal(await rollbackPreflight(rig, v6RowName), "allowed", "with v6's only run completed, rollback is now allowed");
  assert.equal(await rollbackPreflight(rig, v7RowName), "refused", "v7 remains refused (its run is still parked)");
  console.log("[cutover-e2e] RESUME v6: completed on v6 body (name-invariant); v6 now allowed, v7 still refused");

  // -------------------------------------------------------------------------
  // RESUME v7 → completes; now v7 is retirable too.
  // -------------------------------------------------------------------------
  await answerClarify(rig, t7, owner, "Acme Sdn Bhd", "cutover-ans-v7");
  const t7Done = await pollTask(rig, t7, (t) => ["completed", "failed", "cancelled"].includes(t.status), "T7 settles", 40000);
  assert.equal(t7Done.status, "completed", `the v7 run completed (got ${t7Done.status}/${t7Done.error_code})`);
  await pollRun(rig, t7Parked.workflow_run_id, (r) => r.status === "completed", "v7 run completed");
  assert.equal(await rollbackPreflight(rig, v7RowName), "allowed", "with v7's run completed, rollback is now allowed");
  console.log("[cutover-e2e] RESUME v7: completed; v7 now allowed");

  // -------------------------------------------------------------------------
  // Static freeze/registry invariants that make the pin real.
  // -------------------------------------------------------------------------
  {
    // The registry repoints chatTurn: → v7 AND retains the v6 export (so a parked v6 run is never
    // stranded). Asserted textually on the source — a standalone plain-node e2e cannot import the
    // frozen "use workflow" closure (see the header note); the runtime behaviour above already
    // proved v7 is the newest and v6 remained resolvable/runnable.
    const registrySrc = await readFile(new URL("../workflows/registry.ts", import.meta.url), "utf8");
    assert.match(registrySrc, /chatTurn:\s*chatTurn_v7/, "registry repoints chatTurn: → chatTurn_v7 (newest)");
    assert.match(registrySrc, /export\s*\{\s*chatTurn_v6\s*\}/, "registry RETAINS the chatTurn_v6 export (parked v6 runs never stranded)");

    // frozen-workflows.json carries deployed:true, hash-locked entries for BOTH the v6 and v7
    // closures — proving a cutover can never be an in-place body edit (the T6 silent-correctness
    // hazard): the old body stays structurally resolvable.
    const frozen = JSON.parse(await readFile(new URL("../../../frozen-workflows.json", import.meta.url), "utf8"));
    for (const v of ["v6", "v7"]) {
      const entry = frozen.workflows?.[`packages/runtime/workflows/chatTurn.${v}.ts`];
      assert.ok(entry, `frozen-workflows.json has a chatTurn.${v}.ts entry`);
      assert.equal(entry.deployed, true, `chatTurn.${v}.ts is deployed:true (immutable)`);
      assert.match(entry.sha256 ?? "", /^[0-9a-f]{64}$/, `chatTurn.${v}.ts is hash-locked`);
    }
    console.log("[cutover-e2e] static guards: registry repoint + v6 retention + frozen v6/v7 hash-locks");
  }

  console.log("\nVERSION CUTOVER E2E: ALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nVERSION CUTOVER E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
