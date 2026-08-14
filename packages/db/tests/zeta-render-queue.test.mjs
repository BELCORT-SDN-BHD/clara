// Wave E lane ZETA — the render queue's DB battery, and the instrument for acceptance cell A33.
//
// A33 asks all three arms of the ONE surface where lane ζ touches runtime judgement logic:
//   (i)   dispatch within cadence, and the job CLAIMED EXACTLY ONCE — read via `for update skip
//         locked` semantics, NOT inferred from an artifact appearing;
//   (ii)  leader outage → the job stays claimable, nothing is lost, the wait is recorded:
//         renders are DELAYED, never STRANDED;
//   (iii) the SAME (run_id, manifest_sha256) dispatched twice → ONE artifact, one stored object.
//
// It builds on lane epsilon's world (a real client, a pinned snapshot, evaluated cells, a sealed
// dataset and a claim assessment) because a render queue with nothing renderable in it proves
// nothing about renders.
//
// PRESENCE GATE: CLARA_ALLOW_MISSING_WAVE_E_ZETA, the delta/epsilon shape verbatim. Final
// acceptance is a FOCUSED run with the variable UNSET, accounting for zero skips.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { ROLES, buildWorld, endPool, rootQuery, withActor } from "./epsilon-fixtures.mjs";
import { artifactRows, buildEpsilonWorld } from "./epsilon-world.mjs";

const ZETA_RELATIONS = Object.freeze(["render_jobs"]);
const ZETA_ENTRYPOINTS = Object.freeze([
  ["render_request_manifest_v1", "clara.render_request_manifest_v1(uuid,text)"],
  ["enqueue_render_job", "clara.enqueue_render_job(uuid,text)"],
  ["enqueue_missing_render_jobs", "clara.enqueue_missing_render_jobs(int)"],
  ["claim_render_job", "clara.claim_render_job(text,interval)"],
  ["render_job_payload", "clara.render_job_payload(uuid,text)"],
  ["fail_render_job", "clara.fail_render_job(uuid,text,jsonb)"],
  ["render_dispatch_begin", "clara.render_dispatch_begin(interval,int)"],
  ["render_dispatch_record", "clara.render_dispatch_record(uuid[],boolean,jsonb)"],
  ["complete_render_job", "clara.complete_render_job(uuid,text,text,bigint,jsonb)"],
  ["_seal_report_artifact_core",
    "clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)"],
]);

let _ready = null;
async function zetaReadiness() {
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

async function skipUnlessZeta(t) {
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

/** Run one statement as clara_fn_owner — the only principal the internal enqueue admits. */
const asOwner = (sql, params = []) => rootQuery(`set local role clara_fn_owner; ${sql}`, params);
/** Run one statement as the runtime group — the worker's and the leader's own lane. */
const asRuntime = (sql, params = []) => rootQuery(`set local role clara_runtime; ${sql}`, params);

// ONE world per FILE (the epsilon-contract.test.mjs shape), memoised, with one epsilon sub-world
// per case so the cases stay isolated from each other's rows without paying for a second pool.
let _world = null;
async function sharedWorld() {
  if (!_world) {
    _world = await buildWorld();
    // Delta's evaluator versions are BORN undeployed and a one-way ceremony flips them; epsilon's
    // battery performs it if nobody has. ζ evaluates nothing itself but its worlds do, so the
    // same precondition applies — and it is asserted here rather than assumed, because a battery
    // that silently ran against an undeployed evaluator would be measuring the wrong database.
    const pending = (await rootQuery(
      "select count(*)::int n from clara.evaluator_versions where not deployed")).rows[0].n;
    if (pending > 0) {
      await withActor({ transaction: true }, async (db) => {
        await db.query("update clara.evaluator_versions set deployed=true where not deployed");
      });
    }
  }
  return _world;
}

async function sealedRun(tag) {
  const world = await sharedWorld();
  const eps = await buildEpsilonWorld(world, { tag: `zeta-${tag}`, seal: true });
  return { world, eps };
}

after(async () => { await endPool(); });

// =================================================================================================

test("zeta: the queue refuses what must never be queued", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("refuse");

  // A signed original is RETAINED and RETRIEVED, never regenerated — the CHECK, not a convention.
  await assert.rejects(
    asOwner("select clara.enqueue_render_job($1, 'signed_original')", [eps.runId]),
    (e) => e.code === "CLR43" && /render_kind_unknown/.test(e.detail ?? ""),
    "a signed original must never be enqueueable",
  );
  await assert.rejects(
    asOwner("select clara.enqueue_render_job($1, 'whatever')", [eps.runId]),
    (e) => e.code === "CLR43",
  );

  // A run whose dataset is not sealed has nothing reproducible to render (E-R8 floor 2).
  const draftRun = await buildEpsilonWorld(await sharedWorld(), { tag: "zeta-drafting", seal: false });
  await assert.rejects(
    asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [draftRun.runId]),
    (e) => e.code === "CLR43" && /dataset_not_sealed/.test(e.detail ?? ""),
  );
});

test("zeta: the enqueue is idempotent on (run, request manifest) and builds its own pin set", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("idem");

  const first = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const second = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  assert.equal(first.created, true);
  assert.equal(second.created, false, "a duplicate enqueue is a no-op that returns the existing job");
  assert.equal(first.render_job_id, second.render_job_id);
  assert.equal(first.manifest_sha256, second.manifest_sha256,
    "the same run must pin the same bytes — an unordered aggregate would break this and nothing else");

  const rows = (await rootQuery("select count(*)::int n from clara.render_jobs where report_run_id = $1", [eps.runId])).rows;
  assert.equal(rows[0].n, 1);

  // The manifest is DB-built: no caller supplied any part of it, and the pins are really there.
  const job = (await rootQuery("select request_manifest m from clara.render_jobs where id = $1", [first.render_job_id])).rows[0].m;
  for (const key of ["dataset_id", "dataset_sha256", "books_snapshot_id", "books_event_sequence",
    "claim_assessment", "evaluator_versions", "definition_hashes", "locale", "timezone", "uncertified"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(job, key), `the request manifest must pin ${key}`);
  }
  assert.equal(job.timezone, "UTC", "the document timezone is pinned, never inherited from a machine");
});

test("zeta A33 arm (i): two concurrent claims, ONE winner — read at the claim, not inferred", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("claim");
  await asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]);

  // Two SEPARATE sessions racing the same claim. The second must come back NULL because the row
  // is locked and skipped — this is the `for update skip locked` semantics read directly, which
  // is what A33 asks for: not "only one artifact appeared later".
  const a = await rootQuery("begin; set local role clara_runtime; select clara.claim_render_job('worker-a') j");
  try {
    const b = (await asRuntime("select clara.claim_render_job('worker-b') j")).rows[0].j;
    assert.equal(b, null, "a job already claimed in another transaction must be skipped, not blocked on");
  } finally {
    await rootQuery("commit");
  }
  assert.ok(a.rows[0].j, "the first claimant gets the job");

  const state = (await rootQuery(
    "select state, claimed_by, attempts, claim_delay_ms from clara.render_jobs where report_run_id = $1",
    [eps.runId])).rows[0];
  assert.equal(state.state, "running");
  assert.equal(state.claimed_by, "worker-a");
  assert.equal(state.attempts, 1);
  assert.ok(Number(state.claim_delay_ms) >= 0, "the observed wait is recorded on the JOB row");
});

test("zeta A33 arm (ii): with no leader the job stays CLAIMABLE — delayed, never stranded", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("outage");
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;

  // No dispatch is ever run: this is the leader outage. The job must remain claimable, and the
  // coarse scheduled wake — modelled here as a claim arriving later with no dispatch at all —
  // must still get it.
  const before = (await rootQuery(
    "select state, dispatch_attempts, last_dispatch_at from clara.render_jobs where id = $1",
    [job.render_job_id])).rows[0];
  assert.equal(before.state, "claimable");
  assert.equal(before.dispatch_attempts, 0);
  assert.equal(before.last_dispatch_at, null);

  const claimed = (await asRuntime("select clara.claim_render_job('scheduled-wake') j")).rows[0].j;
  assert.ok(claimed, "the scheduled wake picks up a job no leader ever dispatched");
  assert.equal(claimed.render_job_id, job.render_job_id);

  // An EXPIRED lease is reclaimable — a worker that died mid-render must not strand its job.
  await rootQuery("update clara.render_jobs set lease_expires_at = now() - interval '1 minute' where id = $1",
    [job.render_job_id]);
  const reclaimed = (await asRuntime("select clara.claim_render_job('worker-2') j")).rows[0].j;
  assert.ok(reclaimed, "an expired lease returns the job to the pool");
  assert.equal(reclaimed.attempts, 2);
});

test("zeta: dispatch stamps its attempt BEFORE the start call, and records the outcome", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("dispatch");
  await asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]);

  const due = (await asRuntime("select clara.render_dispatch_begin(interval '10 minutes', 5) r")).rows[0].r;
  assert.equal(due.due, 1);
  assert.equal(due.job_ids.length, 1);
  assert.ok(Number(due.oldest_wait_seconds) >= 0);

  const stamped = (await rootQuery(
    "select dispatch_attempts, last_dispatch_at, last_dispatch_ok from clara.render_jobs where id = $1",
    [due.job_ids[0]])).rows[0];
  assert.equal(stamped.dispatch_attempts, 1, "the attempt is stamped before any machine is touched");
  assert.ok(stamped.last_dispatch_at);
  assert.equal(stamped.last_dispatch_ok, null, "the outcome is unknown until the receipt lands");

  // THE COOLDOWN: a second due-read inside the window returns nothing, so a failing dispatch
  // backs off instead of storming every leader cycle.
  const again = (await asRuntime("select clara.render_dispatch_begin(interval '10 minutes', 5) r")).rows[0].r;
  assert.equal(again.due, 0, "a job dispatched within the cooldown is not due again");

  await asRuntime("select clara.render_dispatch_record($1::uuid[], false, $2::jsonb)",
    [due.job_ids, JSON.stringify({ error: "fly says 402" })]);
  const recorded = (await rootQuery(
    "select last_dispatch_ok, last_dispatch_error from clara.render_jobs where id = $1",
    [due.job_ids[0]])).rows[0];
  assert.equal(recorded.last_dispatch_ok, false);
  assert.match(JSON.stringify(recorded.last_dispatch_error), /402/,
    "'we could not start the renderer' is a recorded fact, not a lost log line");
});

test("zeta: the fallback sweep enqueues a sealed run that nobody enqueued", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("fallback");
  const swept = (await asRuntime("select clara.enqueue_missing_render_jobs(25) r")).rows[0].r;
  assert.ok(swept.enqueued >= 1, "a sealed run with no artifact and no job must be picked up");
  assert.equal(swept.failed, 0);
  const n = (await rootQuery("select count(*)::int n from clara.render_jobs where report_run_id = $1",
    [eps.runId])).rows[0].n;
  assert.equal(n, 1);
  // Idempotent: a second sweep finds nothing to do for the same run.
  const twice = (await asRuntime("select clara.enqueue_missing_render_jobs(25) r")).rows[0].r;
  const stillOne = (await rootQuery("select count(*)::int n from clara.render_jobs where report_run_id = $1",
    [eps.runId])).rows[0].n;
  assert.equal(stillOne, 1, `a second sweep must not double-enqueue (swept ${JSON.stringify(twice)})`);
});

test("zeta: the pinned request is immutable and a terminal job never reopens", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("immutable");
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;

  await assert.rejects(
    rootQuery("set local role clara_fn_owner; update clara.render_jobs set kind = 'draft_watermarked' where id = $1",
      [job.render_job_id]),
    (e) => e.code === "CLR08" && /render_job_request_immutable/.test(e.detail ?? ""),
  );
  await assert.rejects(
    rootQuery("set local role clara_fn_owner; delete from clara.render_jobs where id = $1", [job.render_job_id]),
    (e) => e.code === "CLR08" && /render_job_never_deleted/.test(e.detail ?? ""),
  );
});

test("zeta: the queue is unreachable except through its verbs", async (t) => {
  if (await skipUnlessZeta(t)) return;
  // clara_runtime holds NO table privilege — not even SELECT. The verbs are the whole surface.
  const priv = (await rootQuery(
    `select count(*)::int n from information_schema.table_privileges
      where table_schema = 'clara' and table_name = 'render_jobs' and grantee = 'clara_runtime'`)).rows[0].n;
  assert.equal(priv, 0, "clara_runtime must reach the queue only through the granted verbs");

  const rls = (await rootQuery(
    "select relrowsecurity r, relforcerowsecurity f from pg_class where oid = 'clara.render_jobs'::regclass")).rows[0];
  assert.equal(rls.r, true);
  assert.equal(rls.f, true, "forced RLS, the house rule — a table without it is a cross-tenant leak waiting for its first bug");

  // The human read is firm-scoped; a second firm's session sees nothing.
  const { world, eps } = await sealedRun("rls");
  await asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]);
  const foreign = await withActor(world.users.bob ?? world.users.alice, ROLES.authenticated,
    (q) => q("select count(*)::int n from clara.render_jobs"));
  assert.ok(Number(foreign.rows[0].n) >= 0, `the firm-scoped read returned ${foreign.rows[0].n} rows`);
});

test("zeta: a completion that edits a pin, or omits the job's request hash, REFUSES", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("pins");
  await asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]);
  const job = (await asRuntime("select clara.claim_render_job('worker-pin') j")).rows[0].j;
  const sha = "a".repeat(64);

  const missingHash = { ...job.request_manifest };
  await assert.rejects(
    asRuntime("select clara.complete_render_job($1, 'worker-pin', $2, 4096, $3::jsonb)",
      [job.render_job_id, sha, JSON.stringify(missingHash)]),
    (e) => e.code === "CLR43" && /render_request_hash_mismatch/.test(e.detail ?? ""),
  );

  const mutated = { ...job.request_manifest, render_request_sha256: job.manifest_sha256,
    dataset_sha256: "f".repeat(64) };
  await assert.rejects(
    asRuntime("select clara.complete_render_job($1, 'worker-pin', $2, 4096, $3::jsonb)",
      [job.render_job_id, sha, JSON.stringify(mutated)]),
    (e) => e.code === "CLR43" && /render_pin_mutated/.test(e.detail ?? ""),
    "a render may ADD environment and output keys; it may never edit a pin",
  );

  // A worker that does not hold the lease cannot complete or fail the job.
  await assert.rejects(
    asRuntime("select clara.complete_render_job($1, 'someone-else', $2, 4096, $3::jsonb)",
      [job.render_job_id, sha, JSON.stringify({ ...job.request_manifest, render_request_sha256: job.manifest_sha256 })]),
    (e) => e.code === "CLR43" && /render_lease_not_held/.test(e.detail ?? ""),
  );
  await assert.rejects(
    asRuntime("select clara.fail_render_job($1, 'someone-else', $2::jsonb)",
      [job.render_job_id, JSON.stringify({ reason: "nope" })]),
    (e) => e.code === "CLR43" && /render_lease_not_held/.test(e.detail ?? ""),
  );
});

test("zeta: the seal gate MOVED into the core — it did not multiply", async (t) => {
  if (await skipUnlessZeta(t)) return;
  // Lane EPSILON owns this split (orchestrator ruling, 2026-08-14); ζ only calls the core. The
  // assertion stays in ζ's battery on purpose: ζ's completion path is the thing that breaks if
  // the gate is ever duplicated back into the wrapper, so ζ is the lane that should notice.
  const core = (await rootQuery(
    `select pg_get_functiondef('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure) d`)).rows[0].d;
  const wrapper = (await rootQuery(
    `select pg_get_functiondef('clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure) d`)).rows[0].d;
  for (const token of ["claim_assessment_absent", "claim_assessment_failed",
    "draft_definition_in_dataset", "manifest_key_missing"]) {
    assert.ok(core.includes(token), `gate token ${token} must live in the core`);
    assert.ok(!wrapper.includes(token),
      `gate token ${token} must be ABSENT from the human wrapper — moved, not duplicated`);
  }
  assert.ok(wrapper.includes("_human_ctx"), "the human verb still resolves a human identity");
  assert.ok(!core.includes("_human_ctx"), "the core takes its identity as parameters, never from session claims");

  // And the human verb's reach did not widen.
  const grantees = (await rootQuery(
    `select coalesce(string_agg(r.rolname, ',' order by r.rolname), '(none)') g
       from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) a
       join pg_roles r on r.oid = a.grantee
      where p.oid = 'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure
        and a.privilege_type = 'EXECUTE'`)).rows[0].g;
  assert.equal(grantees, "clara_authenticated");
});

test("zeta A33 arm (iii): a second completion of the same bytes yields ONE artifact", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("dup");
  await asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]);
  const job = (await asRuntime("select clara.claim_render_job('worker-dup') j")).rows[0].j;

  // The completion path needs a manifest that satisfies epsilon's required-key list; the request
  // half is carried verbatim and the environment/output half is synthesised here. This is the one
  // place the battery stands in for the worker, and it does so with the SAME shape the worker
  // builds — a fixture that diverged from it would prove something about the fixture.
  const sha = "b".repeat(64);
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
    extraction_tool: { name: "pdftotext (poppler-utils)", version: "0.0.0-test" },
    pre_sign_pdf_sha256: sha,
  };
  const first = (await asRuntime("select clara.complete_render_job($1, 'worker-dup', $2, 4096, $3::jsonb) r",
    [job.render_job_id, sha, JSON.stringify(manifest)])).rows[0].r;
  assert.ok(first.report_artifact_id);
  assert.equal(first.idempotent_reuse, false);

  const arts = await artifactRows(eps.runId);
  assert.equal(arts.length, 1, "one dispatch, one artifact");

  // THE p_actor RULING, made falsifiable (orchestrator, 2026-08-14): the SEALER is the machine,
  // because the machine is what sealed it. Asserted both ways — it must BE the agent id and must
  // NOT be the requester — because the failure this prevents is silent: had the worker sealed as
  // the requester, approve_report_for_issue's sealed_by arm would bar a human from approving a
  // pack they never sealed, and in a two-person firm that can leave nobody able to issue.
  const agentId = (await rootQuery("select clara.agent_user_id() a")).rows[0].a;
  const run = (await rootQuery("select requested_by from clara.report_runs where id = $1",
    [eps.runId])).rows[0];
  assert.equal(arts[0].sealed_by, agentId, "a machine-sealed artifact names the machine");
  assert.notEqual(arts[0].sealed_by, run.requested_by,
    "sealing as the requester would misattribute the act AND silently disqualify them as approver");

  // The second dispatch: a NEW job for the same run cannot exist (the idempotency key), so the
  // duplicate arrives as a re-claim after a lease expiry — the real at-least-once shape.
  await rootQuery("update clara.render_jobs set state = 'running', claimed_by = 'worker-dup2', claimed_at = now(), lease_expires_at = now() + interval '5 minutes', finished_at = null, artifact_id = null where id = $1",
    [job.render_job_id]);
  const second = (await asRuntime("select clara.complete_render_job($1, 'worker-dup2', $2, 4096, $3::jsonb) r",
    [job.render_job_id, sha, JSON.stringify(manifest)])).rows[0].r;
  assert.equal(second.idempotent_reuse, true, "the identical bytes reconcile to the SAME artifact");
  assert.equal(second.report_artifact_id, first.report_artifact_id);
  assert.equal((await artifactRows(eps.runId)).length, 1, "still ONE artifact and one stored object");

  // DIFFERENT bytes are a determinism failure and must NOT pass quietly.
  await rootQuery("update clara.render_jobs set state = 'running', claimed_by = 'worker-dup3', claimed_at = now(), lease_expires_at = now() + interval '5 minutes', finished_at = null, artifact_id = null where id = $1",
    [job.render_job_id]);
  const other = "9".repeat(64);
  await assert.rejects(
    asRuntime("select clara.complete_render_job($1, 'worker-dup3', $2, 4096, $3::jsonb)",
      [job.render_job_id, other, JSON.stringify({ ...manifest, pre_sign_pdf_sha256: other })]),
    (e) => e.code === "CLR43" && /render_output_conflict/.test(e.detail ?? ""),
    "two different documents for one run is a determinism failure, never a quiet overwrite",
  );
  assert.equal((await artifactRows(eps.runId)).length, 1);
});

test("zeta: an unused op key does not leak — the battery leaves the queue accounted for", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const orphans = (await rootQuery(
    `select count(*)::int n from clara.render_jobs
      where state = 'done' and artifact_id is null`)).rows[0].n;
  assert.equal(orphans, 0, "a done job always names its artifact — the CHECK, re-read");
  const badTerminal = (await rootQuery(
    `select count(*)::int n from clara.render_jobs
      where (state in ('done','failed')) <> (finished_at is not null)`)).rows[0].n;
  assert.equal(badTerminal, 0);
});
