// Wave E lane ZETA — the render-queue battery's shared fixtures. NOT a test file: only
// `*.test.mjs` is collected (`.claude/rules/db-tests.md`), and this is a module those files
// import. Extracted when the battery outgrew the repo's 500-line file discipline, the same split
// epsilon made for its phase modules.

import assert from "node:assert/strict";

import { buildWorld, roleQuery, rootQuery, withActor } from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld } from "./epsilon-world.mjs";

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
  ["_seal_report_artifact_core",
    "clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)"],
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
    // precondition applies — and it is asserted here rather than assumed, because a battery that
    // silently ran against an undeployed evaluator would be measuring the wrong database.
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

export async function sealedRun(tag) {
  const world = await sharedWorld();
  const eps = await buildEpsilonWorld(world, { tag: `zeta-${tag}`, seal: true });
  return { world, eps };
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
