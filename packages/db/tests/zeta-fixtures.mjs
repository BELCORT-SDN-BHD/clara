// Wave E lane ZETA — the render-queue battery's shared fixtures. NOT a test file: only
// `*.test.mjs` is collected (`.claude/rules/db-tests.md`), and this is a module those files
// import. Extracted when the battery outgrew the repo's 500-line file discipline, the same split
// epsilon made for its phase modules.

import assert from "node:assert/strict";

import { buildWorld, roleQuery, rootQuery, withActor } from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, seedRigProfile } from "./epsilon-world.mjs";

export const ZETA_RELATIONS = Object.freeze(["render_jobs"]);
export const ZETA_ENTRYPOINTS = Object.freeze([
  ["render_request_manifest_v1", "clara.render_request_manifest_v1(uuid,text)"],
  ["enqueue_render_job", "clara.enqueue_render_job(uuid,text)"],
  ["enqueue_missing_render_jobs", "clara.enqueue_missing_render_jobs(int)"],
  ["claim_render_job", "clara.claim_render_job(text,interval)"],
  ["render_job_payload", "clara.render_job_payload(uuid,text)"],
  ["fail_render_job", "clara.fail_render_job(uuid,text,jsonb)"],
  ["render_dispatch_begin", "clara.render_dispatch_begin(interval,int)"],
  ["render_dispatch_record", "clara.render_dispatch_record(uuid[],boolean,jsonb)"],
  ["complete_render_job", "clara.complete_render_job(uuid,text,text,bigint,jsonb)"],
  ["replay_render_inputs", "clara.replay_render_inputs(uuid)"],
  ["requeue_render_job", "clara.requeue_render_job(uuid,text,boolean)"],
  ["reap_exhausted_render_jobs", "clara.reap_exhausted_render_jobs()"],
  ["render_lease_alive", "clara.render_lease_alive(uuid,text)"],
  // THIRTEEN ARGUMENTS SINCE F-A5 PR-1 (ruling R-L23): (p_obo, p_wake_kind, p_agent) are appended
  // at the TAIL with NULL defaults, so clara.complete_render_job's TEN-argument positional call
  // below is byte-unmoved and still resolves — which is the whole point of the tail-append.
  //
  // THIS ROSTER IS ARITY-EXACT, AND THAT IS A TRIPWIRE, NOT A DETAIL. It feeds zetaReadiness();
  // a stale signature here does not fail, it makes the WHOLE zeta battery report
  // "not applied -- missing: _seal_report_artifact_core" and SKIP. Measured on the F-A5 rig: nine
  // zeta cells vanished into skips while the function they test was present and working. A gate
  // that cannot tell "absent" from "moved" gives a meaningless green either way.
  ["_seal_report_artifact_core",
    "clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)"],
]);

let _ready = null;
export async function zetaReadiness() {
  if (_ready) return _ready;
  const missingRelations = [];
  for (const relation of ZETA_RELATIONS) {
    if (!(await rootQuery("select to_regclass($1) is not null ok", [`clara.${relation}`])).rows[0].ok) {
      missingRelations.push(relation);
    }
  }
  const missingEntrypoints = [];
  for (const [name, signature] of ZETA_ENTRYPOINTS) {
    if (!(await rootQuery("select to_regprocedure($1) is not null ok", [signature])).rows[0].ok) {
      missingEntrypoints.push(name);
    }
  }
  _ready = {
    ready: missingRelations.length === 0 && missingEntrypoints.length === 0,
    missingRelations, missingEntrypoints,
  };
  return _ready;
}

/** Presence gate. Returns true when the caller should stop. */
export async function skipUnlessZeta(t) {
  const readiness = await zetaReadiness();
  if (readiness.ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_WAVE_E_ZETA === "1") {
    t.skip(`Wave E lane zeta not applied -- explicit pre-integration run (missing: ${
      [...readiness.missingRelations, ...readiness.missingEntrypoints].join(", ")})`);
    return true;
  }
  assert.fail(`Wave E lane zeta is required for this suite: ${JSON.stringify(readiness)}`);
  return true;
}

// ROLE-SCOPED, THROUGH THE HOUSE PRIMITIVE. An earlier draft prefixed `set local role …; ` onto
// the SQL string, which Postgres refuses with 42601 ("cannot insert multiple commands into a
// prepared statement") the moment a parameterised query carries two statements — and which would
// ALSO have split a begin/commit pair across two pooled connections. roleQuery does the SET ROLE
// on the same client as the statement, which is the thing that has to be true.
/** Run one statement as clara_fn_owner — the only principal the internal enqueue admits. */
export const asOwner = (sql, params = []) => roleQuery("clara_fn_owner", sql, params);
/** Run one statement as the runtime group — the worker's and the leader's own lane. */
export const asRuntime = (sql, params = []) => roleQuery("clara_runtime", sql, params);

// ONE world per FILE (the epsilon-contract.test.mjs shape), memoised, with one epsilon sub-world
// per case so the cases stay isolated from each other's rows without paying for a second pool.
let _world = null;
export async function sharedWorld() {
  if (!_world) {
    _world = await buildWorld();
    // Delta's evaluator versions are BORN undeployed and a one-way ceremony flips them; epsilon's
    // battery performs it if nobody has. ζ evaluates nothing itself but its worlds do, so the same
    // precondition applies — and it is ENSURED here (swept, never left to chance) rather than
    // assumed, because a battery that silently ran against an undeployed evaluator would be
    // measuring the wrong database. NOTE: this only SWEEPS (a conditional UPDATE); it does not
    // itself assert anything about the resulting state -- delta-contract.test.mjs and
    // epsilon-contract.test.mjs are where that precondition is actually proven.
    //
    // SCOPED, on delta/epsilon's own terms: F-A5 PR-1's evaluate_fs_pack_agent is EXCLUDED by
    // name -- that row's deploy flip is f-a5-reporting-agency-pr1.test.mjs cell D's OWN separate
    // ceremony (design SS3.2, gate-2 material 8), which measures the row's pre-flip refusal. z
    // sorts after f-a5 alphabetically, so this is a no-op in normal estate order -- but on a
    // partial-migration or focused run where f-a5's battery never reaches cell D while zeta's
    // does, an UNSCOPED sweep here would flip that row first and permanently steal cell D's only
    // witness window. Scoped exactly like its delta/epsilon/eta siblings.
    //
    // A SECOND ROW JOINS THE EXCLUSION on identical terms (F-A5b card 1): clara.evaluate_metric
    // **v2**, the substitution seam's stage-(b) evaluator, ships DARK until its own ceremony
    // (CD-15) and f-a5b-card1-seam-stage-b.test.mjs's B5.6 measures its pre-flip refusal. The key
    // becomes (NAME, VERSION) rather than name, and it has to: evaluate_metric **v1** must still
    // deploy here, and a name-only predicate would exclude the whole family.
    const pending = (await rootQuery(
      `select count(*)::int n from clara.evaluator_versions where not deployed
        and (evaluator_name, version) not in (('evaluate_fs_pack_agent',1),('evaluate_metric',2))`)).rows[0].n;
    if (pending > 0) {
      await withActor({ transaction: true }, async (db) => {
        await db.query(`update clara.evaluator_versions set deployed=true where not deployed
          and (evaluator_name, version) not in (('evaluate_fs_pack_agent',1),('evaluate_metric',2))`);
      });
    }
  }
  return _world;
}

/**
 * THE PARK MOVED IN FRONT OF THE SEAL, and that is a consequence of F-A5 PR-1, not a preference.
 *
 * `clara._seal_report_dataset_core` now enqueues the run's `pre_sign` render job ITSELF, inside
 * the sealing transaction — S9's integration line, stated in words at `0080:225-236` since zeta
 * shipped and landed by F-A5 PR-1 (survey R-N5). So the old cell shape
 *
 *     const { eps } = await sealedRun(tag);   // ← the seal enqueues here now
 *     await parkQueue();                      // ← parks the job the seal just made
 *     await enqueue_render_job(run,'pre_sign') // ← idempotent: hands back the PARKED job
 *
 * left every such cell with nothing claimable and nothing due, which is exactly how it failed:
 * `claim_render_job` returned null and the assertions read `null.report_run_id`. Parking BEFORE
 * the seal restores the invariant the cells were written against — after `sealedRun` the queue
 * holds exactly ONE claimable job and it is this run's — without any cell having to know that the
 * seal is now the thing that enqueues.
 *
 * `park: false` is for the one cell that needs TWO runs claimable at once: park on the first,
 * not on the second, or the second's park would swallow the first's job.
 */
export async function sealedRun(tag, opts = {}) {
  const { park = true, ...rest } = opts;
  const world = await sharedWorld();
  if (park) await parkQueue();
  const eps = await buildEpsilonWorld(world, { tag: `zeta-${tag}`, seal: true, ...rest });
  return { world, eps };
}

/**
 * A sealed run whose template BINDS A RIG-ONLY STATUTORY PROFILE — the only shape in which the
 * statutory wording pin exists at all, built the way lane ε says it must be.
 *
 * TWO RULES MEET HERE, and the first draft broke the second one. (1) The ordinary rig run is
 * `management` class with no profile, so its statutory_wording_sha256 pin is NULL and no wording
 * row can move it — a drift test built on that run asserts nothing. (2) epsilon-world.mjs:7-12:
 * rig wording is inserted against a RIG-ONLY profile, NEVER against the shipped mpers_company one,
 * whose zero-wording posture is a live assertion the ε battery re-reads at start and at end (owner
 * task #43's gate). Forging verified wording onto the shipped profile would have made ζ's fixture
 * quietly break ε's — the sort of cross-lane damage that shows up as someone else's red run.
 * So this mints a fresh rig profile through ε's own `seedRigProfile` and binds THAT.
 */
export async function sealedStatutoryRun(tag) {
  const { profileKey, profileVersionId } = await seedRigProfile(`zeta-${tag}`);
  const { world, eps } = await sealedRun(tag, { reportClass: "statutory", profileVersionId });
  return { world, eps, profileKey };
}

/**
 * Drive one run all the way to a SEALED ARTIFACT, the way the worker does: enqueue, claim, complete.
 *
 * It exists because a cell that needed an artifact used to guard itself with `if (arts.length > 0)`
 * — and `sealedRun` seals a DATASET, never an artifact, so that guard was always false and the
 * assertions inside it never ran once. A conditional body is a skip the runner does not count:
 * the cell reported green while testing nothing. Anything needing an artifact now MAKES one and
 * asserts unconditionally.
 *
 * The environment half of the manifest is synthesised with the SAME shape the worker builds (the
 * request half is carried verbatim), so a fixture that drifted from the worker would fail epsilon's
 * shape validation here rather than prove something about itself.
 */
export async function sealArtifact(eps, worker = "battery-sealer", kind = "pre_sign") {
  // THE PARK IS `sealedRun`'s NOW (see there): one world serves the file and claim_render_job
  // hands out the OLDEST job, so the queue must hold only this run's — but since F-A5 PR-1 the
  // SEAL is what enqueues, so parking here would park the very job this fixture must claim.
  // The enqueue below stays, and stays idempotent: for `pre_sign` it hands back the seal's own
  // job, and for any other kind it is still the thing that creates one.
  await asOwner("select clara.enqueue_render_job($1, $2)", [eps.runId, kind]);
  const job = (await asRuntime("select clara.claim_render_job($1) j", [worker])).rows[0].j;
  assert.equal(job?.report_run_id, eps.runId, "the claim must return the job this fixture enqueued");
  const sha = createSha(worker);
  const manifest = {
    ...job.request_manifest,
    render_request_sha256: job.manifest_sha256,
    assembler_version: "clara.reporting-render/v1",
    renderer_image_digest: `sha256:${"c".repeat(64)}`,
    renderer_source_commit: "d".repeat(40),
    node_version: "v20.19.5", os_version: "linux test", architecture: "x64",
    font_engine_version: "typst 0.0.0-test",
    document_metadata: { title: "battery", creation_date_utc: "2025-12-31T00:00:00Z" },
    extracted_text_sha256: "e".repeat(64),
    extraction_tool: "pdftotext (poppler-utils) 0.0.0-test",
    ...(kind === "pre_sign" ? { pre_sign_pdf_sha256: sha } : {}),
  };
  const done = (await asRuntime("select clara.complete_render_job($1, $2, $3, 4096, $4::jsonb) r",
    [job.render_job_id, worker, sha, JSON.stringify(manifest)])).rows[0].r;
  assert.ok(done.report_artifact_id, "the fixture must actually seal an artifact");
  return { jobId: job.render_job_id, artifactId: done.report_artifact_id, sha256: sha };
}

/**
 * MOVE AN UPSTREAM INPUT, so a "the manifest is re-derived" assertion can actually fail.
 *
 * A cell that requeues where nothing has changed passes identically against a verbatim COPY and a
 * fresh DERIVATION — it is mutation-incapable, which is how round 3 shipped a cell that proved
 * nothing about the fix it was written for. clara.statutory_wording is append-only and the pins
 * aggregate over its verified rows, so landing one more verified row for the run's profile is the
 * smallest honest way to make today's derivation differ from yesterday's.
 *
 * Returns the digest of the request manifest AFTER the move, so a caller can assert against a
 * value the database computed rather than one the test assumed.
 */
export async function driftWording(eps, profileKey, kind = "pre_sign") {
  assert.ok(profileKey && profileKey.startsWith("epsilon_rig_"),
    "drift is landed against a RIG-ONLY profile (epsilon-world.mjs:7-12); the shipped profiles' zero-wording posture is a live assertion, not spare fixture space");
  const before = (await asOwner("select clara.render_request_manifest_v1($1, $2) m",
    [eps.runId, kind])).rows[0].m;
  // The window opens 2016-01-01 and never closes, so it covers any rig period — the aggregate the
  // pin hashes selects on `applies_to_periods_beginning_from <= period_start`, and a row outside
  // that window would leave the pin unmoved and the assertion below would (correctly) fail.
  await asOwner(
    `insert into clara.statutory_wording(profile_key, wording_key, locale,
       applies_to_periods_beginning_from, wording_text, source_manifest, source_sha256,
       verification_state, verified_by, verified_at, source_note)
     values ($1, 'zeta_drift_' || substr(md5(random()::text), 1, 8), 'en',
       date '2016-01-01', 'RIG DRIFT WORDING', jsonb_build_object('source', 'rig'), repeat('b', 64),
       'verified', clara.agent_user_id(), now(), 'rig-only drift row: simulates wording landing between a failure and its requeue')`,
    [profileKey]);
  const after = (await asOwner("select clara.render_request_manifest_v1($1, $2) m",
    [eps.runId, kind])).rows[0].m;
  assert.notDeepEqual(after, before,
    "the drift fixture must actually move the pins, or every assertion built on it is vacuous");
  return { before, after };
}

/** A distinct 64-hex per worker tag, so two fixtures in one file never collide on artifact bytes. */
function createSha(tag) {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
}

/**
 * Park every claimable job under a long lease so a queue-sensitive case starts from a KNOWN-EMPTY
 * queue. The rig leg found the battery lying to itself: one world serves the file, every case
 * enqueues, and claim_render_job hands out the OLDEST job — so "the second claimant got nothing"
 * and "the wake got MY job" were asserted against earlier cases' rows. The queue was right; the
 * assertions were about the wrong rows. Parking, not failing: fail_render_job returns a job below
 * its cap to `claimable`, so draining by failing would loop forever; a live lease is invisible to
 * both the claim and the dispatch due-read.
 */
export async function parkQueue() {
  for (let i = 0; i < 500; i++) {
    const j = (await asRuntime("select clara.claim_render_job('battery-park', interval '6 hours') j")).rows[0].j;
    if (!j) return i;
  }
  throw new Error("parkQueue did not converge — the queue is refilling itself, which is its own finding");
}
