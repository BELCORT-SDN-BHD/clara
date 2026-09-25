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
// NAMED RESIDUAL AGAINST AC3 (L06-SPEC-R2-06, fix round 2): the baseline is taken at POLL 1, not at
// the moment this leg's own assertions finish, so two narrow windows are NOT covered. (1) A run
// that reaches `failed` after this leg's assertions finish but BEFORE `waitForQueueDrain` is even
// called is already in the baseline and never reported. (2) Poll 1's own three censuses
// (`censusNonTerminalRuns`, `censusUnboundTasks`, `censusFailedRuns`) are three SEPARATE statements
// inside one `Promise.all`, not one snapshot; a run that fails BETWEEN the non-terminal read and the
// failed read is counted as non-terminal (so the call keeps polling) AND as baseline-failed (so a
// later poll never flags it) — the one failure this file exists to catch, missed on the same poll
// that first baselines it. Both windows are believed narrow (each leg's own assertions already wait
// out their own admitted work before reaching this call, and the three queries are cheap, unindexed
// full-table-ish scans on a small table, not a slow join), and closing them fully would mean reading
// non-terminal AND failed status from ONE statement instead of `censusNonTerminalRuns`'s own
// (shared, independently used) query — deferred rather than done here, to avoid changing a
// library function other callers (the two-build drill's own preflight) also rely on.
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
 * #1151 — THE FIRM NARROWING, AND WHY IT LIVES IN THIS TEST MODULE RATHER THAN IN
 * `lib/rollback-preflight.mjs`. #1151's "Out of scope" line is explicit — "Any migration, any
 * door, any product code path... both are cell gaps" — and its Key interfaces name
 * `tests/queue-drain.mjs`'s own `waitForQueueDrain(rig, opts)` as the seam that needs the scope.
 * `lib/rollback-preflight.mjs` is SHIPPED (imported by `lib/runtime-contracts.mjs` and
 * `scripts/rollback-preflight.mjs`, and present in `.output/server/index.mjs`), so the first cut
 * of this fix — a fourth bind parameter on `censusUnboundTasks` — was product code changed by a
 * test-only ticket (the closing wave's spec review, SPEC-K3-03). The narrowing is therefore done
 * HERE, over the census's own answer: `censusUnboundTasks` is called exactly as every other
 * caller calls it, byte for byte, and the rows it reports are then asked — in one statement —
 * which of them belong to the firms this leg itself built.
 *
 * WHY A NARROWING IS NEEDED AT ALL. On any database that already holds OTHER firms' client data
 * (never true of a freshly built `clara_intake_ci`, always true of a rig clone of a used estate),
 * that other data can mint its own live `clara.agent_tasks` rows — most measurably `held` wake
 * tasks born from the estate's OWN compliance/lint transitions while both
 * `clara.wake_engine_sources` rows are disabled (#1044's follow-up 2; `waveS-lane06-fix.md` /
 * `-fix-2.md`) — that no engine this leg's process runs will EVER clear, because they were never
 * this leg's to drive. Unscoped, this call cannot tell "the estate has unrelated live rows" from
 * "this leg's own admitted work is still live", and answers both the same way: TIMED OUT.
 *
 * AN OMITTED `firmIds` CHANGES NOTHING: the narrowing statement is not issued at all, and every
 * existing caller keeps the exact unscoped answer it has always had. An EMPTY ARRAY is refused by
 * name rather than silently meaning "nothing is live" — `firm_id = any` of an empty array matches
 * no row, so a caller that computed its firms and got an empty list would otherwise see a drain
 * that reports drained with every table full, which is the very failure mode #1151 exists to
 * remove.
 *
 * `censusNonTerminalRuns`/`censusFailedRuns` (`workflow.workflow_runs`) are deliberately NOT
 * narrowed — nothing in this ticket's own measurement named them, and a database this call runs
 * against has never had a body run against it before THIS leg's own process started one
 * (`clara_intake_ci` is always built fresh; a rig clone carries agent_tasks /
 * document_processing_tasks residue from an estate that was seeded, never actually WORKED by a
 * live engine).
 *
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {ReadonlyArray<{table:string, id:string}>} tasks `censusUnboundTasks`'s own rows
 * @param {ReadonlyArray<string>} firmIds
 */
async function narrowTasksToFirms(query, tasks, firmIds) {
  if (tasks.length === 0) return tasks;
  const agentIds = tasks.filter((t) => t.table === "clara.agent_tasks").map((t) => t.id);
  const docIds = tasks.filter((t) => t.table === "clara.document_processing_tasks").map((t) => t.id);
  // FAIL CLOSED on a table this module does not know how to scope: a future third census table
  // must be narrowed deliberately, never silently kept (which would re-open the stranger's-row
  // timeout) or silently dropped (which would hide this leg's OWN live work).
  const unknown = tasks.filter(
    (t) => t.table !== "clara.agent_tasks" && t.table !== "clara.document_processing_tasks");
  if (unknown.length > 0) {
    throw new Error(
      `waitForQueueDrain: censusUnboundTasks reported a table this firm narrowing does not know how `
        + `to scope (${JSON.stringify([...new Set(unknown.map((t) => t.table))])}) — narrow it here `
        + `deliberately rather than letting a firmIds-scoped drain guess.`,
    );
  }
  const r = await query(
    `select 'clara.agent_tasks' as tbl, t.id::text as id   -- queue-drain firm scope
       from clara.agent_tasks t
      where t.id = any($1::uuid[]) and t.firm_id = any($3::uuid[])
      union all
     select 'clara.document_processing_tasks' as tbl, d.id::text as id
       from clara.document_processing_tasks d
      where d.id = any($2::uuid[]) and d.firm_id = any($3::uuid[])`,
    [agentIds, docIds, [...firmIds]],
  );
  const keep = new Set(r.rows.map((row) => `${String(row.tbl)}:${String(row.id)}`));
  return tasks.filter((t) => keep.has(`${t.table}:${t.id}`));
}

/**
 * The queue-drain gate itself. `firmIds` narrows the UNBOUND-TASK census to the firms this leg
 * built (see `narrowTasksToFirms` above); omitted, nothing changes for an existing caller.
 * @param {{rootQuery:(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>}} rig
 * @param {{deadlineMs?:number, log?:(m:string)=>void, firmIds?:ReadonlyArray<string>|null}} [opts]
 * @returns {Promise<{waitedMs:number, polls:number}>}
 */
export async function waitForQueueDrain(rig, opts = {}) {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const log = opts.log ?? (() => {});
  const firmIds = opts.firmIds ?? null;
  if (firmIds !== null && firmIds.length === 0) {
    throw new Error(
      "waitForQueueDrain: firmIds was given as an EMPTY array, which matches no row at all, so this "
        + "call would report DRAINED with every table full — refused by name rather than silently "
        + "answered. Omit firmIds for the unscoped census, or name the firms this leg built.",
    );
  }
  const query = (sql, params) => rig.rootQuery(sql, params);
  const startedAt = Date.now();
  const end = startedAt + deadlineMs;
  let polls = 0;
  // Established on poll 1 — see the header note above on why this is a BASELINE diff and not a
  // blanket "any failed row" rule.
  let failedBaseline = null;
  for (;;) {
    polls += 1;
    const [runs, unboundAll, failedNow] = await Promise.all([
      censusNonTerminalRuns(query),
      censusUnboundTasks(query),
      censusFailedRuns(query),
    ]);
    // #1151 — the narrowing rides OVER the census's own answer, so `censusUnboundTasks` is called
    // exactly as every other caller calls it (see `narrowTasksToFirms` above).
    const unbound = firmIds === null
      ? unboundAll
      : { ...unboundAll, tasks: await narrowTasksToFirms(query, unboundAll.tasks, firmIds) };
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
