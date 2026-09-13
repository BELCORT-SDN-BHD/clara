// The accounting-plan due-occurrence scan (#640 — migration 0193). Split out of reconciler.mjs
// like reconciler-sst.mjs / reconciler-lint.mjs / reconciler-fa.mjs / reconciler-adjustments.mjs
// (module-size budget), and — like the D-a FA belt and the D-b adjustment belt — it must
// FEATURE-DETECT its own DB surface: this runtime image ships before 0193 lands (the standing
// runtime-image-first, DB-second ceremony order), so it boots dormant on a pre-0193 database and
// lights on the very next cycle after 0193 applies, with no restart.
//
// FEATURE-DETECT, EXACT SIGNATURE, PER CYCLE (never cached at startup — the
// wiki-projection.mjs:321-346 R5 idiom, cloned from reconciler-adjustments.mjs).
// `clara.wake_due_plan_occurrences(integer,text)` is a plain catalog read (no EXECUTE needed), so
// the guard never fails for a privilege reason and it distinguishes THIS exact signature from any
// future overload of the name. Absent → a clean no-op ({planOk:true, planDormant:true}), never a
// failure: the belt simply has nothing to do yet.
//
// EVERY CYCLE, NOT DAILY — AND THAT IS THE CADENCE DECISION, NOT AN OVERSIGHT (#640's C54.3
// obligation: "treat cadence as an authorised schedule product setting; do not inherit 1h as
// current"). The four DAILY belts beside it (SST, lint, FA, adjustments) each re-derive per-client
// arithmetic IN THE RUNTIME or in a per-client DB probe, so running them every ~2s would be real
// work in this process. This one does not: ONE call, and everything it costs is inside that one
// statement — a row source of ACTIVE PLANS ONLY (two partial indexes), a handful of equality
// probes per such plan (all served by the occurrence table's two unique indexes), the
// `due_date <= (now() at time zone <the revision's timezone>)::date` gate among them, and
// `scanned: 0` on an estate with nothing due. The shape it copies is therefore
// reconcileRenderDispatch (leader.mjs:225 — every cycle, latency is the feature), not
// reconcileAdjustmentRuns. The cost of the daily shape would be up to 24 hours between a due date
// arriving in Kuala Lumpur and the Work existing, and #640's acceptance is about a due EVENT.
//
// THE DUE ARITHMETIC IS DB-OWNED, WHOLLY. This module computes no date, reads no plan row and
// knows nothing about frequencies, day rules, timezones or reversal legs. It calls one verb and
// counts what came back. There is deliberately no client-side mirror of the admission law for the
// two to drift apart (the 0045 belt's own lesson, stated there as "the DB owns every number").
//
// BOUNDED. `p_limit` caps how many plans one call may admit for; the DB additionally caps it to
// 100 internally. A backlog is drained across cycles rather than in one unbounded sweep, and
// because the belt runs every cycle a real backlog clears in seconds rather than days.
//
// ERROR ISOLATION IS THE DATABASE'S HERE, NOT A PER-CLIENT LOOP'S. `clara.
// wake_due_plan_occurrences` isolates each plan inside its own exception block and ANSWERS
// (`admitted:false` with a typed reason) rather than raising for every business outcome — a
// paused plan, an inactive client, a de-authorised authoriser. So this belt has exactly one
// call to contain, and a throw from it means something structural (a connection, a privilege, a
// half-applied migration), which is reported as planOk:false and retried next cycle.
//
// NO OPERATOR FLAG IS READ, ANYWHERE. A plan's authority is its own recorded instruction. There
// is no global enable-agentic switch and this belt does not consult `clara.wake_engine_sources`
// (#640: "there is no global enable-agentic switch"). 0193's own tail census asserts the same
// thing on the verb's live body.
//
// SHARED HEARTBEAT. Like every other sweeper, this belt writes NO heartbeat of its own —
// runReconcilerSweep beats 'reconciler' once per full sweep cycle (reconciler.mjs), and this
// module is one more pass folded into that same beat.
//
// AUTHORITY: `clara.wake_due_plan_occurrences` is EXECUTE-granted to clara_runtime ONLY — a plain
// call on the already-role-set leader connection (setRuntimeRole in leader.mjs), the
// run_depreciation_period / run_adjustment_occurrence precedent, with NO reset-role/login-direct
// dance. The verb derives the firm, the client and the AUTHORISING HUMAN internally from the plan
// row; the runtime supplies only a batch ceiling and the model snapshot the run will carry.
//
// NO NEW LISTEN CONSUMER; NO WDK. A plain polled belt exactly like reconciler-adjustments.mjs: it
// neither listens on a channel nor starts a workflow run. The Work it admits is dispatched by
// reconciler-work.mjs §A, which is the estate's ONE dispatcher for DB-only admission.

import { TaxonomyHaltError } from "./relay.mjs";

/** How many plans one call may admit for. The DB clamps to [1,100] itself; this is the belt's own
 *  ceiling and it is deliberately well under that, because the belt runs EVERY cycle and a
 *  backlog therefore drains in seconds rather than needing one big sweep. */
const PLAN_SCAN_LIMIT = 25;

/** The model snapshot a plan-initiated run records. Same source as the work route's own
 *  `DEFAULT_MODEL` (packages/runtime/src/workRoutes.ts:75) so a Work admitted by the belt and one
 *  admitted by `POST /api/work/journal` name the same model. Passed EXPLICITLY rather than left to
 *  the DB's fallback: the process that knows which model will serve the run is this one. */
const PLAN_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";

/** True iff `clara.wake_due_plan_occurrences(integer,text)` exists — the EXACT signature, never an
 *  overloaded-name `to_regproc` probe. Evaluated PER CYCLE, never cached at startup, so the belt
 *  lights the moment 0193 lands. */
async function hasPlanSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.wake_due_plan_occurrences(integer,text)') is not null as surface",
  );
  return r.rows[0]?.surface === true;
}

const dormant = () => ({
  planOk: true, planScanned: 0, planAdmitted: 0, planConverged: 0, planRefused: 0,
  planDormant: true,
});
const failed = () => ({
  planOk: false, planScanned: 0, planAdmitted: 0, planConverged: 0, planRefused: 0,
  planDormant: false,
});

/**
 * One pass of the accounting-plan due scan.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{log?:Function, limit?:number, model?:string}} opts
 */
export async function reconcilePlanOccurrences(client, opts = {}) {
  const log = opts.log ?? (() => {});
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : PLAN_SCAN_LIMIT;
  const model = typeof opts.model === "string" && opts.model.trim() !== "" ? opts.model : PLAN_MODEL;

  // THE PROBE IS ISOLATED, exactly as reconciler-adjustments.mjs does it: a catalog read that
  // THROWS is a connection or session problem, never a dormant surface, and reporting the two
  // identically would tell the caller the belt succeeded on a failed read.
  let surface;
  try {
    surface = await hasPlanSurface(client);
  } catch (err) {
    // A HALT must still reach the leader even through this probe catch — re-check before
    // containing (the belt() wrapper's own law in reconciler.mjs).
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] plan-occurrence surface probe error: ${err?.message ?? err}`);
    return failed();
  }
  if (!surface) return dormant(); // 0193 is not applied yet — a clean no-op, never a failure

  let answer;
  try {
    const r = await client.query("select clara.wake_due_plan_occurrences($1::int, $2::text) as r",
      [limit, model]);
    answer = r.rows[0]?.r ?? null;
  } catch (err) {
    if (err instanceof TaxonomyHaltError || err?.halt) throw err;
    log(`[reconcile] plan occurrence scan error: ${err?.message ?? err}`);
    return failed();
  }

  // ANOMALOUS SHAPE, LOUD (the reconciler-adjustments.mjs round-8 F2 cure, cloned). The verb's
  // documented contract always answers {scanned,admitted,converged,refused,…}; any other shape
  // would read as a healthy idle sweep under a bare `?? {}` fallback and be indistinguishable from
  // one. Named here instead; the belt still does not crash and retries next cycle.
  if (answer === null || typeof answer !== "object" || !Number.isInteger(answer.scanned)) {
    log(`[reconcile] plan occurrence scan returned an unexpected shape (expected {scanned:int,…}, got ${JSON.stringify(answer)}) — treating this cycle as failed`);
    return failed();
  }

  const out = {
    planOk: true,
    planScanned: answer.scanned ?? 0,
    planAdmitted: answer.admitted ?? 0,
    planConverged: answer.converged ?? 0,
    planRefused: answer.refused ?? 0,
    planDormant: false,
  };

  // A REFUSED DUE EVENT IS NAMED, NOT JUST COUNTED. Its reason is the whole diagnostic: a
  // de-authorised authoriser and an inactive client are different facts about the estate, and the
  // occurrence row carries the reason but nothing reads that row on the operator's behalf.
  const rows = Array.isArray(answer.occurrences) ? answer.occurrences : [];
  for (const o of rows) {
    if (o?.admitted === true) {
      log(`[reconcile] plan occurrence admitted plan=${o.plan_id} due=${o.due_date} leg=${o.leg} work=${o.work_id}${o.replayed ? " (replayed)" : ""}`);
    } else if (o?.converged === true) {
      log(`[reconcile] plan occurrence converged plan=${o.plan_id} due=${o.due_date} work=${o.work_id} — another scan admitted it first`);
    } else {
      log(`[reconcile] plan occurrence NOT admitted plan=${o?.plan_id} due=${o?.due_date ?? "?"} reason=${o?.reason ?? "?"}${o?.code ? ` code=${o.code}` : ""}`);
    }
  }

  if (out.planScanned > 0) {
    log(`[reconcile] plan occurrences scanned=${out.planScanned} admitted=${out.planAdmitted} converged=${out.planConverged} refused=${out.planRefused}`);
  }
  return out;
}

export { PLAN_SCAN_LIMIT, PLAN_MODEL };
