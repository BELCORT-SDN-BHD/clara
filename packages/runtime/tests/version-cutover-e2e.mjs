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
// runbook SQL step (run live in WB-R18; the contract now lives in packages/runtime/README.md,
// 'Deployment and rollback' — the docs/ops/ runbook this line used to cite is not in this
// repository) + a static freeze-lint — never an executable rig test with parked runs across a
// version cutover.
//
// #708: the preflight helpers below are scoped to only the runs THIS file stages
// (STAGED_RUN_IDS), so a rig pre-seeded with unrelated parked runs is tolerated BY DESIGN — and
// that tolerance is proven IN-RUN, not just by hand: before the rollback-preflight legs, this
// file plants a batch of foreign-scope non-terminal `workflow.workflow_runs` rows directly in
// SQL (see "THE PREFLIGHT'S SCOPE" and "#708 SELF-PROOF" below) and cleans them up before
// exiting. Like every standalone runtime e2e (interview, version-cutover, work-journal,
// work-question, work-cancel — see packages/runtime/README.md, 'Standalone e2es'), this file
// still must not share a host with another suite WHILE it runs — the #708 scoping tolerates a
// rig that carries an EARLIER suite's leftovers, not a suite hammering the same rows
// concurrently.
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
// Requires a BUILT server (.output/server/index.mjs → pnpm build) + the rig DB (the FULL migration
// chain + seed + the WDK world bootstrap) + WORKFLOW_POSTGRES_URL at that SAME DB. The "17
// migrations" this line used to name was a point-in-time count and went stale within weeks — the
// requirement was always "whatever the chain currently is", and #637 replaced the number with it.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";
// #637 — the census this file used to open-code now lives in the runtime's own module, beside the
// CLI an operator runs before a rollback. One implementation, two consumers.
import { bodyIdentifierOf, preflight } from "../lib/rollback-preflight.mjs";
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";

// --- Fail-closed local gate (#1018: shared with every other standalone World e2e driver; the
// intake-e2e precedent). The parsed-DSN check (not merely the string regex) is the actual gate:
// every field of WORKFLOW_POSTGRES_URL must independently agree with the PG* env this process is
// trusting — never merely "looks like" a loopback URL.
assertLocalDbGate({
  label: "version-cutover-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}`),
  checkDsnString: true,
  checkDsnParsed: true,
});

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

// ---------------------------------------------------------------------------
// THE PREFLIGHT'S SCOPE (#708). Both helpers below used to census `workflow.workflow_runs`
// GLOBALLY. That is the right shape for the real runbook — a live rollback genuinely asks about
// every run on the estate — and the wrong shape for a test, because the verdict then depends on
// whatever else happens to be parked on the database. Measured during #623: a shared local rig
// carrying 20 parked `chatTurn_v18` runs left by an earlier suite answered `refused` at the
// "with v8's run completed, rollback is now allowed" leg, for reasons that had nothing to do
// with the cutover under test. CI gives each e2e its own database (.github/actions/db-live-gates),
// so only a reused local rig bit — and a red that reads as a cutover defect but is actually a
// neighbour's leftovers is worse than no coverage.
//
// So the SCOPE is the runs this file staged, collected as it stages them (`STAGED_RUN_IDS`), and
// every census is filtered to that set. The preflight LOGIC — per-name zero-check, inventory
// against a supported-name set — is untouched; only the universe it reads is. Since #637 that
// logic is no longer retyped here at all: both helpers below hand the scope to
// `packages/runtime/lib/rollback-preflight.mjs` (`preflight`), the same module the operator CLI
// runs, so the scope is a caller's argument rather than a second implementation of the census. The verdicts the
// cutover legs assert therefore depend solely on this e2e's own state, on a fresh database and a
// populated one alike.
//
// That last claim used to rest on a MANUAL proof only (a worker pre-seeding 25 parked
// foreign-name runs into a shared rig by hand and watching this file still pass) — never
// executable coverage. It now proves itself: before the rollback-preflight legs run, this file
// plants its own batch of foreign-scope non-terminal rows directly in SQL, asserts the OLD
// global shape WOULD have counted them (unscoped count > scoped count), and asserts every
// scoped helper below reaches the SAME verdict with the plants sitting in the table as without
// them — see the "#708 SELF-PROOF" block in main().
// ---------------------------------------------------------------------------
/** Every `workflow.workflow_runs.id` this e2e staged. Filled by `stageRun` as each leg parks.
 *  The WDK's own column is `varchar` (world-postgres 0000_cultured_the_anarchist.sql:36), NOT a
 *  uuid — so the census binds these as `text[]` (lib/rollback-preflight.mjs,
 *  `censusNonTerminalRuns`: `id = any($2::text[])`), and a `uuid[]` bind would fail at parse time. */
const STAGED_RUN_IDS = [];
function stageRun(runId) {
  if (!runId) throw new Error("stageRun: a staged run must carry a workflow_run_id — refusing to scope the preflight to nothing");
  STAGED_RUN_IDS.push(runId);
  return runId;
}

/** The runbook §0/§8 preflight, executable: a version is rollback-'allowed' iff it has ZERO
 *  non-terminal runs (packages/runtime/README.md, 'Deployment and rollback') — scoped to the runs
 *  this e2e staged, per the note above.
 *
 *  #637 — DELEGATED to packages/runtime/lib/rollback-preflight.mjs rather than restated here. This
 *  file used to carry the only executable version of the runbook's census, which is precisely why
 *  it never ran at the moment it exists for; the census is now a module and a CLI, and this e2e is
 *  COVERAGE of it rather than a second implementation that could drift from it (review law 3: take
 *  it by import, do not retype it). An empty supported set means "every run in scope is
 *  unsupported", which is exactly the per-name question this helper asks.
 *
 *  #708 — and the scope carries BOTH selectors: the NAME (the per-name question this helper is)
 *  AND the run ids this e2e staged. The name alone would not be enough — the SELF-PROOF leg in
 *  main() plants a foreign row carrying the SAME NAME as the newest chatTurn's parked run but a
 *  DIFFERENT id, so a helper narrowed by name only would answer `refused` on somebody else's row.
 *  The module binds the ids as `id = any($n::text[])` (`censusNonTerminalRuns`), which is what the
 *  WDK's `varchar` id column needs; a `uuid[]` bind would fail at parse time. */
async function rollbackPreflight(rig, name) {
  const out = await preflight({
    query: (sql, params) => rig.rootQuery(sql, params),
    supported: [],
    scope: { nameLike: name, runIds: STAGED_RUN_IDS },
  });
  // #637 review B2 — the module now returns TWO verdicts: `verdict` is the GLOBAL one (what the
  // CLI's exit code follows, because a parked run of another class strands just as hard) and
  // `scoped.verdict` is the narrowed one. THIS helper asks a per-NAME question, so it must read
  // the narrowed view; reading the global one here would make "closeExample has zero runs" answer
  // `refused` because some other name has one — which is not what the line above it asserts.
  return out.scoped.verdict;
}

/** The runbook's INVENTORY-shaped preflight: a real rollback doesn't ask "does THIS ONE name
 *  have zero runs" — it asks "is EVERYTHING currently in flight covered by the build I'm rolling
 *  back to". Refuse if ANY non-terminal run's name falls outside `supportedNames`.
 *
 *  #708 — SCOPED to the runs THIS e2e staged. It used to count every non-terminal row in the
 *  database, which is correct for a production rollback and wrong for a shared local rig: 20 parked
 *  `chatTurn_v18` runs left by an earlier suite were measured making the "with v8's run completed,
 *  rollback is now allowed" leg answer `refused` for reasons unrelated to the cutover under test.
 *  CI runs each e2e on its own database, so only local rigs bit — which is exactly the class of
 *  defect that survives CI indefinitely. The supported set is given as run NAMES here (this file's
 *  own idiom) and mapped to BODY identifiers, which is what the module compares.
 *
 *  `runIds` DEFAULTS to `STAGED_RUN_IDS` — the scope every cutover leg below wants — while an
 *  explicit `null` asks the OLD global question on purpose, which is what the #708 self-proof legs
 *  use to reproduce the defect beside the scoped answer that survives it. */
async function rollbackPreflightInventory(rig, supportedNames, runIds = STAGED_RUN_IDS) {
  const out = await preflight({
    query: (sql, params) => rig.rootQuery(sql, params),
    supported: supportedNames.map(bodyIdentifierOf),
    scope: { runIds },
  });
  // The NARROWED view when this caller narrowed, the GLOBAL one when it did not — which is exactly
  // the #708 line below: the same helper, called with and without the ids, must answer about
  // different populations. `preflight` always measures both and never lets one stand in for the
  // other, so the choice is made HERE and visibly.
  return out.scoped ?? out;
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
  stageRun(t7Parked.workflow_run_id); // #708: this run, and only this run, is in the preflight's universe
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
  stageRun(t8Parked.workflow_run_id); // #708
  const v8RowName = (await rig.readWorkflowRun(t8Parked.workflow_run_id)).name;
  assert.match(
    v8RowName,
    newestRowNamePattern,
    `new admission bound the NEWEST version (registry-derived: ${newestExportName}, row name ${v8RowName})`,
  );
  assert.notEqual(v7RowName, v8RowName, "the v7 run and the newest-version run carry DISTINCT body names");
  console.log(`[cutover-e2e] CUTOVER: new admission → ${newestExportName} (${v8RowName})`);

  // -------------------------------------------------------------------------
  // #708 SELF-PROOF: a prior worker proved BY HAND that the scoped preflight below still
  // reaches the right verdicts on a rig pre-seeded with 25 parked runs of an unrelated
  // workflow name — but a manual proof isn't executable coverage. Reproduce it here instead
  // of merely asserting a scope filter exists: plant a batch of non-terminal
  // `workflow.workflow_runs` rows this e2e never staged — 24 of a wholly FOREIGN workflow
  // name, plus (matching the manual proof) ONE more that carries the SAME NAME as the newest
  // chatTurn's own parked run (v8RowName) but a DIFFERENT id — a name collision without an id
  // collision, so a helper that scoped by name alone (instead of by id) would be caught here
  // too. All 25 are 'running' — the WDK's own in-flight run status; 'paused' doesn't exist
  // any more (world-postgres migration 0004_remove_run_pause_status.sql folded it into
  // 'cancelled'), so 'running' is the realistic non-terminal status for a parked run's row.
  // -------------------------------------------------------------------------
  const FOREIGN_WORKFLOW_NAME = "someOtherFirmsWorkflow_v1";
  const PLANTED_RUN_IDS = [];
  try {
    for (let i = 0; i < 24; i++) {
      const id = `planted-708-foreign-${randomUUID()}`;
      await rig.rootQuery(
        `insert into workflow.workflow_runs (id, deployment_id, status, name, input)
         values ($1, 'planted-708-proof', 'running', $2, '{}'::jsonb)`,
        [id, FOREIGN_WORKFLOW_NAME],
      );
      PLANTED_RUN_IDS.push(id);
    }
    {
      const id = `planted-708-samename-${randomUUID()}`;
      await rig.rootQuery(
        `insert into workflow.workflow_runs (id, deployment_id, status, name, input)
         values ($1, 'planted-708-proof', 'running', $2, '{}'::jsonb)`,
        [id, v8RowName],
      );
      PLANTED_RUN_IDS.push(id);
    }
    console.log(
      `[cutover-e2e] #708 planted ${PLANTED_RUN_IDS.length} foreign non-terminal runs ` +
        `(24x "${FOREIGN_WORKFLOW_NAME}", 1x same-name-as-v8/different-id) — none in STAGED_RUN_IDS`,
    );

    // (i) the OLD global shape WOULD have counted them: the unscoped census must exceed the
    // scoped one now that 25 rows outside this e2e's own scope exist.
    const unscoped = await rig.rootQuery(
      `select count(*)::int n from workflow.workflow_runs where status not in ('completed','failed','cancelled')`,
    );
    const scoped = await rig.rootQuery(
      `select count(*)::int n from workflow.workflow_runs
        where id = any($1::text[]) and status not in ('completed','failed','cancelled')`,
      [STAGED_RUN_IDS],
    );
    assert.ok(
      Number(unscoped.rows[0].n) > Number(scoped.rows[0].n),
      `#708: the OLD global shape (${unscoped.rows[0].n} non-terminal runs) must count MORE than the ` +
        `scoped inventory (${scoped.rows[0].n}, this e2e's own ${STAGED_RUN_IDS.length} staged runs) ` +
        `now that foreign rows are planted`,
    );
    console.log(`[cutover-e2e] #708: unscoped=${unscoped.rows[0].n} > scoped=${scoped.rows[0].n} — the old global shape WOULD have counted the plants`);

    // -------------------------------------------------------------------------
    // ROLLBACK PREFLIGHT (executable): both parked → both REFUSED (per-name),
    // AND the inventory-shaped preflight against a v7-only supported set (the
    // build being rolled back to — it never registered the newest export)
    // REFUSES BY NAME. Asserted WHILE the #708 plants above sit in the table: (ii) the scoped
    // helpers below must reach these SAME verdicts regardless of the 25 foreign rows.
    // -------------------------------------------------------------------------
    assert.equal(await rollbackPreflight(rig, v7RowName), "refused", "v7 has a non-terminal run → rollback refused");
    assert.equal(await rollbackPreflight(rig, v8RowName), "refused", "the newest version has a non-terminal run → rollback refused");
    // The zero-run control (asserted directly, not inferred): a registered-but-unused version
    // passes. Under the #708 scope this is "a version with no run among the ones this e2e staged",
    // which is what makes it a control at all — the two refusals immediately above come from the
    // SAME scope and the SAME helper, so a helper that could only ever say `refused` is caught here.
    assert.equal(await rollbackPreflight(rig, closeExampleName), "allowed", "a workflow with ZERO runs → rollback allowed");
    console.log("[cutover-e2e] preflight: v7 refused, v8 refused, closeExample (zero-run) allowed");

    const inv1 = await rollbackPreflightInventory(rig, [v7RowName, closeExampleName]);
    assert.equal(inv1.verdict, "refused", "inventory against a v7-only supported set REFUSES while v8 is non-terminal");
    assert.ok(inv1.outside.some((r) => r.name === v8RowName), "the inventory refusal NAMES v8 as the unsupported non-terminal build");
    assert.ok(
      inv1.outside.every((r) => r.name !== FOREIGN_WORKFLOW_NAME),
      "#708: the scoped inventory never SEES the planted foreign name at all — the plants are outside its universe, not merely tolerated",
    );
    console.log(`[cutover-e2e] inventory preflight (v7-only supported set): refused, naming ${v8RowName}; #708 plants invisible to it`);

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
    // proving the inventory tracks live state, not a snapshot taken at the refusal above. The
    // #708 plants (still sitting in the table) remain outside its universe throughout.
    const inv2 = await rollbackPreflightInventory(rig, [v7RowName, closeExampleName]);
    assert.equal(inv2.verdict, "allowed", "with both runs terminal, the SAME v7-only inventory now ALLOWS");
    console.log("[cutover-e2e] inventory preflight (same v7-only supported set): now allowed, #708 plants still ignored");
  } finally {
    // #708: clean up regardless of pass/fail, and even on a re-run against the SAME database —
    // these are this leg's own rows (not append-only estate data), so a plain DELETE by the ids
    // we planted is the correct shape, and it must not accumulate across repeated local runs.
    if (PLANTED_RUN_IDS.length > 0) {
      const del = await rig.rootQuery(`delete from workflow.workflow_runs where id = any($1::text[])`, [PLANTED_RUN_IDS]);
      assert.equal(
        del.rowCount,
        PLANTED_RUN_IDS.length,
        "#708: cleanup deleted exactly the planted rows — no trigger silently refused or short-counted the delete",
      );
      console.log(`[cutover-e2e] #708 cleanup: deleted ${del.rowCount} planted rows`);
    }
  }

  // #708's own acceptance line, driven rather than described: the SAME allowed verdict survives a
  // database pre-seeded with parked non-terminal runs of ANOTHER workflow name. Twenty of them was
  // the measured shape (parked chatTurn_v18 runs left by an earlier suite on a shared rig). The
  // name is deliberately one no registry entry claims, so the running engine has no job for these
  // rows and can never be asked to replay them; they exist only to be counted, and they are
  // removed in the same block.
  {
    const noiseIds = [];
    const noiseName = "workflow//./workflows/notAWorkflow.v1//notAWorkflow_v1";
    for (let i = 0; i < 20; i += 1) {
      const id = `wrun_cutover_noise_${randomUUID().replace(/-/g, "")}`;
      noiseIds.push(id);
      await rig.rootQuery(
        "insert into workflow.workflow_runs (id, deployment_id, status, name) values ($1,$2,'running'::workflow.status,$3)",
        [id, "cutover-noise", noiseName],
      );
    }
    try {
      const unscoped = await rollbackPreflightInventory(rig, [v7RowName, closeExampleName], null);
      assert.equal(unscoped.verdict, "refused", "UNSCOPED, the noise dominates the answer — which is the #708 defect, reproduced");
      // The FULL result here, not the helper's narrowed view: this leg is about the two verdicts
      // being reported SEPARATELY (#637 review B2). A scoped "allowed" must never be readable as a
      // global one, so the module returns both and says which is which.
      const full = await preflight({
        query: (sql, params) => rig.rootQuery(sql, params),
        supported: [v7RowName, closeExampleName].map(bodyIdentifierOf),
        scope: { runIds: STAGED_RUN_IDS },
      });
      assert.equal(full.scoped.verdict, "allowed", "#708: SCOPED to this e2e's own runs, 20 unrelated parked runs change nothing");
      assert.equal(full.scope.given, true, "…and the result SAYS it was narrowed, so it can never be read as a global verdict");
      assert.equal(full.verdict, "refused", "…while the GLOBAL verdict beside it still sees the noise — that is the one an exit code follows");
      assert.ok(full.outside.some((row) => row.name === noiseName), "…and the global census names the noise it refused on");
      console.log("[cutover-e2e] #708: with 20 unrelated parked runs present, the unscoped inventory refuses and the SCOPED one still allows");
    } finally {
      await rig.rootQuery("delete from workflow.workflow_runs where id = any($1::text[])", [noiseIds]);
    }
  }

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
