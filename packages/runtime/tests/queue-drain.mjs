// #967 — the shared "is this database's async queue actually empty" gate. Called by a CI intake
// leg right before it exits, NEVER from outside between legs: the calling leg's own process is the
// only one with an ENGINE ACTUALLY RUNNING against the database (the leader loop, the classify
// consumer, the WDK world), so it is the only place that can DRIVE the queue to empty rather than
// merely observe it stuck. The moment a leg's process calls `process.exit(...)`, every consumer in
// it dies with it, and whatever it left non-terminal sits untouched — inert, not "in flight" — until
// the NEXT leg's fresh process boots its OWN consumers and finds it. That is the cross-leg noise
// #967 measured: roughly 1.27 million log lines from a THIRD leg's engine re-discovering and
// re-attempting work TWO earlier legs left behind on the shared `clara_intake_ci` database and its
// bootstrapped Workflow world, dominated by `lib/classify.mjs`'s own capped-task line (logged once
// per poll of a task some earlier run left permanently `queued`, forever, by design — see that
// file's `MAX_ATTEMPTS` comment).
//
// WHAT COUNTS AS "LIVE" IS NOT A NEW DEFINITION. It is exactly the two censuses
// `lib/rollback-preflight.mjs` already exposes and `tests/two-build-cutover-e2e.mjs` already uses
// for the SAME kind of question ("does this database carry live state a fresh process must not
// collide with?"):
//   * `censusNonTerminalRuns` — `workflow.workflow_runs` not in a TERMINAL_RUN_STATUSES status:
//     every WDK-backed lane (documentIngest, invoiceFacts, statementFacts, witnessFacts, and any
//     accounting/chat Work a leg admits).
//   * `censusUnboundTasks` — `clara.agent_tasks` / `clara.document_processing_tasks` rows in a LIVE
//     status with no bound workflow run. This is the ONLY one of the two that sees the `classify`
//     lane, which rides its own consumer loop rather than a workflow run
//     (`DOCUMENT_LANES_WITHOUT_WORKFLOW`) and is exactly the lane #967's own measurement named.
//
// PLUS A THIRD CENSUS THESE TWO DELIBERATELY DO NOT COVER (L06-967-B, fix round 1):
// `TERMINAL_RUN_STATUSES` (`lib/rollback-preflight.mjs`) counts `failed` as terminal, so a run an
// earlier leg's queued work left NON-terminal, and which THIS leg's still-running engine then
// drives to a genuine `failed`, simply stops appearing in `censusNonTerminalRuns` — the two
// censuses above would call that "drained" even though what actually happened is exactly the
// failure AC3 names ("a genuine failure left behind by an earlier leg's queued work"), not an
// absence of one.
//
// A BASELINE, NOT A BLANKET RULE — measured on this rig's own reused `clara_intake_ci`
// (fix round 1): the two legs' own ordinary exercise already leaves DOZENS of `failed`
// `documentIngest_v2` runs behind as their OWN resolved scope (retry exhaustion on a document a
// scenario means to reject, an admission refusal, and so on) — each one already terminal by the
// time this leg's own assertions finish and this function is even called. Throwing on any
// `failed` row's mere PRESENCE would make the gate red on nearly every ordinary run, which is
// AC2's "no assertion weakened" in reverse. What AC3 actually asks to catch is narrower: a run
// left QUEUED (non-terminal, so visible in `censusNonTerminalRuns`) reaching `failed` DURING this
// specific wait, under THIS leg's own still-running engine — not a failure this leg, or an
// earlier one, had already resolved and moved on from before the wait began. So the FIRST poll
// only takes a baseline snapshot of `failed` ids; every later poll compares against exactly that
// snapshot and throws the moment a NEW one appears, never on one the baseline already carried.
// `intake-batch-e2e.mjs` (leg 3) runs strictly after both callers, so it can never be the source
// of a run this baseline mistakes for pre-existing.
//
// BOUNDED, NEVER A FIXED SLEEP (#967's own ask, "reuse a readiness check... instead of a fixed
// sleep"). Each leg's own assertions already poll everything THEY admit to a terminal status before
// reaching this call, so a clean leg drains in well under a second; a genuine straggler gets the
// full deadline to settle under THIS process's still-running engine. A straggler still live after
// the deadline THROWS, naming exactly which rows — #967's AC3: a leftover failure surfaces as a
// failure of THIS leg, rather than being carried silently into the next leg's log as noise.
//
// NEVER CALLED BY THE LAST LEG IN A CHAIN. `tests/intake-batch-e2e.mjs` deliberately ends with live
// rows of its own (a declared-fact wait, a quota wait, an unassigned failed upload — its own §5
// scope) because nothing in the CI job runs against `clara_intake_ci` after it; calling this there
// would fail the leg on the very state it exists to prove. It is called by `intake-e2e.mjs` and
// `intake-admission-e2e.mjs` — the two legs a sibling leg's fresh engine follows.
import { setTimeout as sleep } from "node:timers/promises";
import { censusNonTerminalRuns, censusUnboundTasks } from "../lib/rollback-preflight.mjs";

const DEFAULT_DEADLINE_MS = 30000;
const POLL_MS = 200;

/**
 * `workflow.workflow_runs` rows CURRENTLY `failed` — deliberately NOT read through
 * `censusNonTerminalRuns` (`failed` is one of `TERMINAL_RUN_STATUSES` there, on purpose: a
 * rollback preflight cares whether a body is still IN FLIGHT, not whether an earlier one lost).
 * Returned as an id->name Map so callers can diff two snapshots by id.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @returns {Promise<Map<string, string>>}
 */
async function censusFailedRuns(query) {
  const r = await query(
    `select id, name
       from workflow.workflow_runs
      where status = 'failed'
      order by name`,
  );
  return new Map(r.rows.map((row) => [String(row.id), String(row.name)]));
}

/**
 * @param {{rootQuery:(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>}} rig
 * @param {{deadlineMs?:number, log?:(m:string)=>void}} [opts]
 * @returns {Promise<{waitedMs:number, polls:number}>}
 */
export async function waitForQueueDrain(rig, opts = {}) {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const log = opts.log ?? (() => {});
  const query = (sql, params) => rig.rootQuery(sql, params);
  const startedAt = Date.now();
  const end = startedAt + deadlineMs;
  let polls = 0;
  // Established on poll 1 — see the header note above on why this is a BASELINE diff and not a
  // blanket "any failed row" rule.
  let failedBaseline = null;
  for (;;) {
    polls += 1;
    const [runs, unbound, failedNow] = await Promise.all([
      censusNonTerminalRuns(query),
      censusUnboundTasks(query),
      censusFailedRuns(query),
    ]);
    if (failedBaseline === null) {
      failedBaseline = failedNow;
    } else {
      const newlyFailed = [...failedNow].filter(([id]) => !failedBaseline.has(id));
      if (newlyFailed.length > 0) {
        throw new Error(
          `waitForQueueDrain: a run left behind by an earlier leg's queued work FAILED while `
            + `this leg's own engine drove it (#967 AC3) — a genuine failure, not noise, so this `
            + `leg fails rather than draining it away.\n`
            + `  newly failed: ${JSON.stringify(newlyFailed.map(([id, name]) => ({ id, name })))}`,
        );
      }
    }
    if (runs.length === 0 && unbound.tasks.length === 0) {
      const waitedMs = Date.now() - startedAt;
      log(`[queue-drain] drained (polls=${polls}, waited=${waitedMs}ms)`);
      return { waitedMs, polls };
    }
    if (Date.now() >= end) {
      throw new Error(
        `waitForQueueDrain: TIMED OUT after ${deadlineMs}ms (polls=${polls}) with live work still on this database — `
          + `the NEXT leg's fresh engine would inherit and re-attempt it as cross-leg noise (#967).\n`
          + `  non-terminal runs: ${JSON.stringify(runs)}\n`
          + `  unbound live tasks: ${JSON.stringify(unbound.tasks)}`,
      );
    }
    await sleep(POLL_MS);
  }
}
