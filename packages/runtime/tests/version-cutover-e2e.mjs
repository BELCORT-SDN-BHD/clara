// STANDALONE v25 version-cutover + rollback-preflight e2e (Wave B, GATE 7 — the
// rig-confined fault gate). NOT a `node --test` file: it boots the built server + the real
// WDK Postgres world IN-PROCESS (the world-e2e.mjs §2 clarify-park pattern), stages a parked
// run on a RETAINED OLD version (chatTurn_v7, a fixture — see below), cuts a second turn
// over to whatever registry.ts's chatTurn: mapping CURRENTLY names as newest (through the
// registry indirection), proves the parked v7 run resumes+completes on its ORIGINAL body
// (name-column invariance — the Slice-0 T6 evidence), and turns the WB-R18 runbook
// rollback-preflight SQL into executable coverage.
//
// Version pair maintenance note (Codex round 9, §7-A PR-RUNTIME's own CI leg — this exact
// class is PART 2's dated-tripwire pattern, already recorded for interview-e2e): this test
// used to HARDCODE the concrete "newest" literal (v8), which went stale the moment a later
// PR repointed chatTurn: to v9 and broke CI silently-until-red. Fixed: the NEWEST leg is now
// DERIVED from registry.ts's own live `chatTurn: chatTurn_vN` pin (deriveNewestChatTurnExport
// below) — never a hardcoded literal — so a future repoint no longer requires touching this
// file at all for the newest side. The OLD/retained leg stays a hardcoded fixture (chatTurn_
// v7): the invariant under test — "a parked run on an old, already-shipped body stays bound
// to that body while new admissions go to whatever is currently newest" — holds for ANY
// sufficiently old, still-frozen, still-deployed body, not specifically v7; v7 is simply a
// convenient, permanently-retained (policy: no parked run is ever stranded) representative,
// legitimately a STAGED fixture rather than an EXPECTED-CURRENT fact. The frozen-workflows.
// json check below therefore also splits: v7's `deployed:true` stays an asserted invariant
// (an old fixture is, by construction, already shipped); the DERIVED newest entry is only
// asserted to exist and be hash-locked — its OWN `deployed` flag is genuinely ceremony-
// dependent (a freshly-repointed newest leg starts hash-locked-but-NOT-yet-deployed until
// its own ceremony runs `--lock-deployed`, exactly as this file's own PRIOR version of this
// note already anticipated) and is not a stable fact this e2e should pin either way. Run:
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
// frozen chatTurn_v7 "use workflow" proxy — the workflowId-bearing proxy is produced by the
// nitro/WDK build transform (unavailable under tsx or plain node), and the built proxy is not
// separately importable from the server bundle. The WDK-native equivalent is start({ workflowId
// }) — the exact shape the engine's OWN boot re-enqueue uses (@workflow/core runtime runs.js).
// So we reference v7 by its build-manifest workflowId, and GUARD-assert the STARTED run's
// workflow.workflow_runs.name really is a chatTurn_v7 body (deriving the name from the ROW, never
// hardcoding the WDK path+export format) — a wrong reference fails loud, never false-greens.
//
// Requires a BUILT server (.output/server/index.mjs → pnpm build) + the rig DB (17 migrations +
// 0002 seed + the WDK world bootstrap) + WORKFLOW_POSTGRES_URL at that SAME DB.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

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
// DSN GUARD (the parsed comparison is the actual gate; the regexes above are only a first
// line): every field of WORKFLOW_POSTGRES_URL must independently agree with the PG* env this
// process is trusting — never merely "looks like" a loopback URL.
{
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const okProtocol = u.protocol === "postgres:";
  const okHost = LOCAL_HOSTS.has(u.hostname);
  const okPort = u.port === String(process.env.PGPORT ?? "");
  const okPath = u.pathname === "/" + (process.env.PGDATABASE ?? "");
  const okQuery = [...u.searchParams.keys()].length === 0; // allowlist: none
  if (!okProtocol || !okHost || !okPort || !okPath || !okQuery) {
    throw new Error(
      `version-cutover-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate (protocol=${u.protocol} host=${u.hostname} port=${u.port} vs PGPORT=${process.env.PGPORT} path=${u.pathname} vs /${process.env.PGDATABASE} query=${u.search})`);
  }
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1";
// OS-assigned: CI jobs from different PRs share the runner host's network namespace; a
// fixed port cross-wires one job's client into another job's runtime (401 jwt_signature).
process.env.PORT ||= await ephemeralPort();
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
// Lengthen the reconciler grace far beyond the test window so the leader loop can never
// re-enqueue the unbound T6 on workflows.chatTurn (whatever's currently newest) mid-test —
// start(v7) is the sole starter.
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
const FETCH_TIMEOUT_MS = 15000;

// HANG BOUND: a real (non-unref'd) top-level watchdog — the backstop for a hang AbortSignal.
// timeout on individual fetches (below) cannot cover (e.g. a poll loop's own logic hanging).
const WATCHDOG_MS = 5 * 60 * 1000;
setTimeout(() => {
  console.error(`\nVERSION CUTOVER E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

const mint = (sub) =>
  new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD).setIssuedAt().setExpirationTime("15m").sign(key);

async function waitHealthy(deadlineMs = 20000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).ok) return;
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

/** Derive the CURRENT newest chatTurn export from registry.ts's own live pin — never a
 *  hardcoded literal (Codex round 9: the prior hardcoded "v8" went stale the moment a later
 *  PR repointed chatTurn: to v9, and CI went red silently-until-caught — the SAME
 *  dated-tripwire class PROJECTLOG PART 2 already tracks for interview-e2e). Reads
 *  registry.ts's source once and extracts the literal `chatTurn: chatTurn_vN` mapping via
 *  regex — the SAME source text the static registry guard near the end of this file also
 *  reads, so both consumers share ONE read and ONE derivation, never two independently
 *  hardcoded expectations that could drift from each other. */
async function deriveNewestChatTurnExport() {
  const registrySrc = await readFile(new URL("../workflows/registry.ts", import.meta.url), "utf8");
  const m = /chatTurn:\s*(chatTurn_v(\d+))\b/.exec(registrySrc);
  if (!m) throw new Error("could not derive the newest chatTurn export — registry.ts has no `chatTurn: chatTurn_vN` mapping");
  return { registrySrc, exportName: m[1], version: Number(m[2]), fileName: `chatTurn.v${m[2]}.ts` };
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

/** The runbook's INVENTORY-shaped preflight: a real rollback doesn't ask "does THIS ONE name
 *  have zero runs" — it asks "is EVERYTHING currently in flight covered by the build I'm rolling
 *  back to". Refuse if ANY non-terminal run's name falls outside `supportedNames`. */
async function rollbackPreflightInventory(rig, supportedNames) {
  const r = await rig.rootQuery(
    "select name, count(*)::int n from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by name",
  );
  const outside = r.rows.filter((row) => !supportedNames.includes(row.name));
  return { verdict: outside.length === 0 ? "allowed" : "refused", outside };
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

  const v7ManifestName = await manifestWorkflowId("chatTurn.v7.ts", "chatTurn_v7");
  const closeExampleName = await manifestWorkflowId("closeExample.v1.ts", "closeExampleV1");
  const { registrySrc, exportName: newestExportName, version: newestVersion, fileName: newestFileName } = await deriveNewestChatTurnExport();
  const newestRowNamePattern = new RegExp(`chatTurn\\.v${newestVersion}\\b|${newestExportName}\\b`);
  console.log(`[cutover-e2e] derived newest chatTurn export from registry.ts: ${newestExportName} (${newestFileName})`);

  const { owner, client } = await rig.buildFirm("cutover");
  const jwt = await mint(owner);

  // -------------------------------------------------------------------------
  // ADMIT+PARK v7 FIRST — mirrors the real deploy sequence: the RETAINED OLD
  // version's run is already in flight BEFORE the new build's registry
  // repoint ever admits anything. Admit unbound via rig.beginChatTurn (NOT the
  // HTTP route — that would auto-start v8), then start v7 in the same tick so
  // its claimRunStep CAS binds v7 before anything else.
  // -------------------------------------------------------------------------
  const s7start = await rig.createChatSession({ author: owner, client });
  const t7Receipt = await rig.beginChatTurn({ session: s7start, author: owner, turnKey: "cutover-v7", parts: [{ type: "text", text: "help please" }] });
  const t7 = t7Receipt.task_id;
  await start({ workflowId: v7ManifestName }, [{ taskId: t7 }]);
  const t7Parked = await pollTask(rig, t7, (t) => t.status === "awaiting_input", "T7 parks on clarify (v7)");
  const v7RowName = (await rig.readWorkflowRun(t7Parked.workflow_run_id)).name;
  // GUARD: prove v7 (not a reconciler-raced newest) actually bound — fail loud so the race never false-greens.
  assert.match(v7RowName, /chatTurn\.v7|chatTurn_v7/, `GUARD: the parked run bound chatTurn_v7, not the newest export (row name ${v7RowName})`);
  console.log(`[cutover-e2e] parked v7 run staged FIRST (${v7RowName})`);

  // -------------------------------------------------------------------------
  // CUTOVER: AFTER v7 is already parked, a NEW admission targets the CURRENT
  // newest version (registry-derived above — see the "derived newest chatTurn
  // export" log line for exactly which one, this run) through the registry
  // indirection — the HTTP /turns route calls start(workflows.chatTurn) =
  // the live pin.
  // -------------------------------------------------------------------------
  const s8 = await rig.createChatSession({ author: owner, client });
  const turnRes = await fetch(`${BASE}/api/chat/${s8}/turns`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ turnKey: "cutover-newest", parts: [{ type: "text", text: "help please" }] }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  assert.equal(turnRes.status, 202, "newest-version turn admitted 202");
  const t8 = (await turnRes.json()).task_id;
  const t8Parked = await pollTask(rig, t8, (t) => t.status === "awaiting_input", "T8 parks on clarify");
  const v8RowName = (await rig.readWorkflowRun(t8Parked.workflow_run_id)).name;
  assert.match(
    v8RowName,
    newestRowNamePattern,
    `new admission bound the NEWEST version (registry-derived: ${newestExportName}, row name ${v8RowName})`,
  );
  assert.notEqual(v7RowName, v8RowName, "the v7 run and the newest-version run carry DISTINCT body names");
  console.log(`[cutover-e2e] CUTOVER: new admission → ${newestExportName} (${v8RowName})`);

  // -------------------------------------------------------------------------
  // ROLLBACK PREFLIGHT (executable): both parked → both REFUSED (per-name),
  // AND the inventory-shaped preflight against a v7-only supported set (the
  // build being rolled back to — it never registered the newest export)
  // REFUSES BY NAME.
  // -------------------------------------------------------------------------
  assert.equal(await rollbackPreflight(rig, v7RowName), "refused", "v7 has a non-terminal run → rollback refused");
  assert.equal(await rollbackPreflight(rig, v8RowName), "refused", "the newest version has a non-terminal run → rollback refused");
  // The zero-run control (asserted directly, not inferred): a registered-but-unused version passes.
  assert.equal(await rollbackPreflight(rig, closeExampleName), "allowed", "a workflow with ZERO runs → rollback allowed");
  console.log("[cutover-e2e] preflight: v7 refused, v8 refused, closeExample (zero-run) allowed");

  const inv1 = await rollbackPreflightInventory(rig, [v7RowName, closeExampleName]);
  assert.equal(inv1.verdict, "refused", "inventory against a v7-only supported set REFUSES while v8 is non-terminal");
  assert.ok(inv1.outside.some((r) => r.name === v8RowName), "the inventory refusal NAMES v8 as the unsupported non-terminal build");
  console.log(`[cutover-e2e] inventory preflight (v7-only supported set): refused, naming ${v8RowName}`);

  // -------------------------------------------------------------------------
  // RESUME v7 on its ORIGINAL body → completes; the name column NEVER migrates to v8.
  // -------------------------------------------------------------------------
  await answerClarify(rig, t7, owner, "Acme Sdn Bhd", "cutover-ans-v7");
  const t7Done = await pollTask(rig, t7, (t) => ["completed", "failed", "cancelled"].includes(t.status), "T7 settles", 40000);
  assert.equal(t7Done.status, "completed", `the parked v7 run completed (got ${t7Done.status}/${t7Done.error_code})`);
  assert.equal(t7Done.error_code, null, "v7 completed with no error_code");
  const v7RunAfter = await pollRun(rig, t7Parked.workflow_run_id, (r) => ["completed", "failed", "cancelled"].includes(r.status), "v7 run terminal");
  // PIN: the name column is INVARIANT — the retained v7 body completed the run, never migrated.
  assert.equal(v7RunAfter.name, v7RowName, "PIN: the run's name column stayed chatTurn_v7 across completion (never migrated to v8)");
  assert.equal(v7RunAfter.status, "completed", "the v7 run is completed");

  // v7 is now retirable (zero non-terminal v7 runs); v8 STILL has its parked run → still refused.
  assert.equal(await rollbackPreflight(rig, v7RowName), "allowed", "with v7's only run completed, rollback is now allowed");
  assert.equal(await rollbackPreflight(rig, v8RowName), "refused", "v8 remains refused (its run is still parked)");
  console.log("[cutover-e2e] RESUME v7: completed on v7 body (name-invariant); v7 now allowed, v8 still refused");

  // -------------------------------------------------------------------------
  // RESUME v8 → completes; now v8 is retirable too.
  // -------------------------------------------------------------------------
  await answerClarify(rig, t8, owner, "Acme Sdn Bhd", "cutover-ans-v8");
  const t8Done = await pollTask(rig, t8, (t) => ["completed", "failed", "cancelled"].includes(t.status), "T8 settles", 40000);
  assert.equal(t8Done.status, "completed", `the v8 run completed (got ${t8Done.status}/${t8Done.error_code})`);
  await pollRun(rig, t8Parked.workflow_run_id, (r) => r.status === "completed", "v8 run completed");
  assert.equal(await rollbackPreflight(rig, v8RowName), "allowed", "with v8's run completed, rollback is now allowed");
  console.log("[cutover-e2e] RESUME v8: completed; v8 now allowed");

  // With BOTH runs terminal, the SAME v7-only inventory (unchanged supported set) now allows —
  // proving the inventory tracks live state, not a snapshot taken at the refusal above.
  const inv2 = await rollbackPreflightInventory(rig, [v7RowName, closeExampleName]);
  assert.equal(inv2.verdict, "allowed", "with both runs terminal, the SAME v7-only inventory now ALLOWS");
  console.log("[cutover-e2e] inventory preflight (same v7-only supported set): now allowed");

  // -------------------------------------------------------------------------
  // Static freeze/registry invariants that make the pin real.
  // -------------------------------------------------------------------------
  {
    // The registry repoints chatTurn: → the DERIVED newest export AND retains the v7 export (so
    // a parked v7 run is never stranded). Asserted textually on the SAME registrySrc the
    // derivation itself already read at the top of main() (one read, one source of truth) — a
    // standalone plain-node e2e cannot import the frozen "use workflow" closure (see the header
    // note); the runtime behaviour above already proved the derived export is the newest and v7
    // remained resolvable/runnable.
    assert.match(registrySrc, new RegExp(`chatTurn:\\s*${newestExportName}\\b`), `registry repoints chatTurn: → ${newestExportName} (the derived newest)`);
    assert.match(registrySrc, /export\s*\{\s*chatTurn_v7\s*\}/, "registry RETAINS the chatTurn_v7 export (parked v7 runs never stranded)");

    // frozen-workflows.json carries a hash-locked entry for BOTH closures, proving a cutover can
    // never be an in-place body edit (the T6 silent-correctness hazard): the old body stays
    // structurally resolvable. v7's `deployed:true` is a stable INVARIANT — it is chosen
    // specifically as an old, already-shipped fixture, so it is asserted unconditionally
    // (the exact SAME assertion this file already made when v8 itself WAS the derived newest,
    // and correctly kept making after v8's own deploy-lock ceremony landed). The DERIVED newest
    // entry's `deployed` flag is deliberately NOT asserted either way: a freshly-repointed newest
    // leg starts hash-locked-but-NOT-yet-deployed until its OWN ceremony runs --lock-deployed —
    // exactly the "split state" this file's own header has anticipated since the v7->v8 repoint,
    // and pinning a specific boolean here would recreate the SAME dated-expectation trap that
    // originally broke this file (the ORIGINAL v7->v8 assertion pinned "v8 NOT YET deployed" as a
    // point-in-time truth and correctly tripped once v8's ceremony actually ran).
    const frozen = JSON.parse(await readFile(new URL("../../../frozen-workflows.json", import.meta.url), "utf8"));
    const v7Entry = frozen.workflows?.["packages/runtime/workflows/chatTurn.v7.ts"];
    assert.ok(v7Entry, "frozen-workflows.json has a chatTurn.v7.ts entry");
    assert.equal(v7Entry.deployed, true, "chatTurn.v7.ts is deployed:true (already live, immutable)");
    assert.match(v7Entry.sha256 ?? "", /^[0-9a-f]{64}$/, "chatTurn.v7.ts is hash-locked");

    const newestEntry = frozen.workflows?.[`packages/runtime/workflows/${newestFileName}`];
    assert.ok(newestEntry, `frozen-workflows.json has a ${newestFileName} entry`);
    assert.match(newestEntry.sha256 ?? "", /^[0-9a-f]{64}$/, `${newestFileName} is hash-locked`);
    console.log(
      `[cutover-e2e] static guards: registry repoint (-> ${newestExportName}) + v7 retention + frozen v7/${newestFileName} hash-locks ` +
        `(v7 deploy-locked; ${newestFileName} deployed=${newestEntry.deployed === true} — ceremony-dependent, not asserted either way)`,
    );
  }

  console.log("\nVERSION CUTOVER E2E: ALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nVERSION CUTOVER E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
