// #637 (C54.2 / C-70) — THE ROLLBACK PREFLIGHT, executable.
//
// THE DEFECT. "Before rollback, inventory non-terminal `workflow.workflow_runs` and verify the
// target image contains every referenced workflow name/version" has been PROSE in
// packages/runtime/README.md since Wave B, and prose is not a gate. The only executable version
// of it lived inside `tests/version-cutover-e2e.mjs` — a test, not a tool an operator can run
// against a live database before typing `fly deploy --image <previous>`. So the one moment the
// check exists for is the one moment nothing runs it.
//
// WHAT IT COUNTS, AND WHY IT IS TWO QUESTIONS RATHER THAN ONE.
//
//   1. NON-TERMINAL `workflow.workflow_runs`, grouped by `name`. A run's `name` is the WDK
//      workflowId (`workflow//./workflows/claraWork.v1//claraWork_v1`), so the BODY it is
//      parked on is derivable FROM THE ROW — never from a hardcoded literal, which is the
//      version-cutover e2e's own hard-won rule (a hardcoded "v8" went stale the moment a later
//      PR repointed the registry, and CI went red silently-until-caught).
//
//   2. UNBOUND `accounting_work` TASKS. This is the half nothing counted, and the README already
//      admitted it in prose: "a rollback to a `claraWork`-less image leaves already-admitted
//      `clara.accounting_work` rows with queued `accounting_work` tasks that no export can run".
//      Those tasks have `workflow_run_id IS NULL` — they exist BEFORE any workflow run does — so
//      a census of `workflow_runs` alone reports a clean estate while admitted Work sits waiting
//      for a body the target image does not carry. The lane parks rather than losing work, which
//      is the honest description; but "it parks" is a thing to DECIDE about, not a thing to
//      discover afterwards.
//
// THE SUPPORTED SET COMES FROM THE TARGET IMAGE, NEVER FROM THIS ONE. Two doors, and both answer
// the same question about the artifact rather than about the repo:
//   * `supportedBodiesFromBundle(bundleText)` scans a BUILT bundle for the WDK body directives it
//     actually registers — the same evidence `scripts/check-workflow-bundle.mjs` uses, and the
//     same reason: the bundle is the served artifact, the source is not.
//   * `/api/build-info`'s `bodies` on a running target, which is the registry's own roster.
//   Measured on the current build, the two agree exactly (49 bodies).
//
// SCOPE (#708). A preflight over a SHARED database — a local rig, a CI database several suites
// share — answers about runs nobody asked about. `scope` narrows the census to named run ids, to
// a name substring, or to named Work ids, and the verdict then depends only on those. It is
// EXPLICIT and OFF by default: a preflight that silently narrowed itself would be worse than one
// that over-refuses, because the failure mode is a stranded run rather than a wasted minute.
//
// FAIL-CLOSED. A read that throws is not "allowed": `preflight()` lets the error out, and the CLI
// exits non-zero with it. The one thing this module must never do is answer "go ahead" because it
// could not look.

import { makeClient } from "./relay.mjs";

/** Terminal WDK run statuses. Everything else (`pending`, `running`) is in flight. */
export const TERMINAL_RUN_STATUSES = Object.freeze(["completed", "failed", "cancelled"]);

/** `clara.agent_tasks` statuses that mean the task still expects a body to run it. */
export const LIVE_TASK_STATUSES = Object.freeze(["queued", "running"]);

/**
 * The BODY identifier a WDK run name carries.
 *
 * `workflow//./workflows/claraWork.v1//claraWork_v1` -> `claraWork_v1`. The format is the WDK's
 * (`<module path>//<export>`), so the export is whatever follows the LAST `//`. A name that does
 * not carry one is returned unchanged rather than nulled: an unrecognised name must still be
 * COMPARABLE against the supported set, and comparing it verbatim is what makes it refuse.
 * @param {string} runName
 */
export function bodyIdentifierOf(runName) {
  if (typeof runName !== "string" || runName.length === 0) return "";
  const at = runName.lastIndexOf("//");
  return at < 0 ? runName : runName.slice(at + 2);
}

/** The module stem a body identifier implies: `claraWork_v1` -> `claraWork.v1`, `closeExampleV1`
 *  -> `closeExample.v1`. The SAME derivation scripts/check-workflow-bundle.mjs's resumability
 *  rule uses, so the two instruments cannot disagree about what a body's directive looks like. */
function moduleStemOf(identifier) {
  const m = /^(.*?)_?[vV](\d+)$/.exec(identifier);
  return m ? `${m[1]}.v${m[2]}` : null;
}

/**
 * Every workflow BODY a built bundle registers, read off its WDK directives.
 *
 * The bundle carries a directive string per registered closure, `workflows/<stem>//<export>`.
 * STEP directives share that shape (`workflows/chatTurn.v18.impl//runModelSegmentStepV18`), so
 * the filter is structural rather than a suffix guess: a BODY is a directive whose module stem is
 * exactly the one its own export identifier implies. Measured against the current build this
 * yields exactly the 49 identifiers `registry.ts`'s `workflowBodies` declares, which is the
 * cross-check that makes the derivation trustworthy rather than plausible.
 * @param {string} bundleText
 * @returns {string[]} sorted, de-duplicated
 */
export function supportedBodiesFromBundle(bundleText) {
  const found = new Set();
  if (typeof bundleText !== "string") return [];
  for (const m of bundleText.matchAll(/workflows\/([A-Za-z0-9_.-]+)\/\/([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    const stem = m[1];
    const identifier = m[2];
    if (moduleStemOf(identifier) === stem) found.add(identifier);
  }
  return [...found].sort();
}

/**
 * The non-terminal run census, grouped by name.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {{runIds?:ReadonlyArray<string>, nameLike?:string|null}} [scope]
 */
export async function censusNonTerminalRuns(query, scope = {}) {
  const runIds = scope.runIds ?? null;
  const nameLike = scope.nameLike ?? null;
  const r = await query(
    `select name, count(*)::int as n, min(created_at) as oldest
       from workflow.workflow_runs
      where status not in ('completed','failed','cancelled')
        and ($1::text[] is null or id = any($1::text[]))
        and ($2::text is null or name like '%' || $2 || '%')
      group by name
      order by name`,
    [runIds, nameLike],
  );
  return r.rows.map((row) => ({
    name: String(row.name),
    body: bodyIdentifierOf(String(row.name)),
    count: Number(row.n),
    oldest: row.oldest ?? null,
  }));
}

/**
 * `accounting_work` tasks that are still live and bound to NO workflow run.
 *
 * These are invisible to the run census by construction — the task exists from the moment
 * `clara.admit_journal_work` commits, and the run only exists once a worker picks it up. They are
 * counted against the `claraWork` CLASS rather than against a body: an unbound task has not
 * chosen a version yet, so what it needs from the target image is simply that a `claraWork` body
 * exists there at all.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {{workIds?:ReadonlyArray<string>|null, taskIds?:ReadonlyArray<string>|null}} [scope]
 */
export async function censusUnboundAccountingWork(query, scope = {}) {
  const workIds = scope.workIds ?? null;
  const taskIds = scope.taskIds ?? null;
  const r = await query(
    `select id, work_id, status
       from clara.agent_tasks
      where kind = 'accounting_work'
        and status in ('queued','running')
        and workflow_run_id is null
        and ($1::uuid[] is null or work_id = any($1::uuid[]))
        and ($2::uuid[] is null or id = any($2::uuid[]))
      order by created_at`,
    [workIds, taskIds],
  );
  return r.rows.map((row) => ({ id: String(row.id), workId: row.work_id == null ? null : String(row.work_id), status: String(row.status) }));
}

/** Does `supported` carry ANY body of this class? (`claraWork_v1` and `claraWork_v9` both do.) */
function classIsCarried(supported, className) {
  return supported.some((id) => {
    const m = /^(.*?)_?[vV](\d+)$/.exec(id);
    return (m ? m[1] : id) === className;
  });
}

/**
 * THE VERDICT. `refused` when anything in scope needs a body the target image does not carry.
 *
 * @param {{
 *   query: (sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>,
 *   supported: ReadonlyArray<string>,
 *   scope?: {runIds?:ReadonlyArray<string>|null, nameLike?:string|null, workIds?:ReadonlyArray<string>|null, taskIds?:ReadonlyArray<string>|null},
 *   unboundClass?: string,
 * }} args
 */
export async function preflight({ query, supported, scope = {}, unboundClass = "claraWork" }) {
  if (typeof query !== "function") throw new TypeError("preflight needs a `query` function");
  if (!Array.isArray(supported)) throw new TypeError("preflight needs a `supported` array of body identifiers");
  const scoped = Boolean(scope.runIds || scope.nameLike || scope.workIds || scope.taskIds);

  const runs = await censusNonTerminalRuns(query, scope);
  const outside = runs.filter((row) => !supported.includes(row.body));

  // WHICH CENSUS A SCOPE IS ASKING ABOUT. A RUN-SHAPED selector (run ids, or a run-name filter)
  // cannot be asking about an unbound task: that task has no row in `workflow_runs` and
  // therefore neither an id nor a name to match. A WORK-SHAPED selector (work ids, task ids) is
  // asking about exactly those. So the unbound leg runs when the caller named Work, or when the
  // caller narrowed nothing at all — never merely because a run-shaped scope happened to be set.
  // Getting this wrong is not academic: an unrelated parked Work left on a shared rig would
  // otherwise refuse a rollback the caller scoped precisely to avoid that, which is #708 again
  // wearing a different hat.
  const runShaped = Boolean(scope.runIds || scope.nameLike);
  const workShaped = Boolean(scope.workIds || scope.taskIds);
  const askUnbound = workShaped || !runShaped;
  const unbound = askUnbound ? await censusUnboundAccountingWork(query, scope) : [];
  const unboundStrands = unbound.length > 0 && !classIsCarried(supported, unboundClass);

  const reasons = [];
  if (outside.length > 0) reasons.push("unsupported_body");
  if (unboundStrands) reasons.push("unbound_accounting_work");

  return {
    verdict: reasons.length === 0 ? "allowed" : "refused",
    reasons,
    scoped,
    supported: [...supported],
    runs,
    outside,
    unbound: { count: unbound.length, strands: unboundStrands, tasks: unbound },
  };
}

/**
 * The BOOT-TIME half: which bodies are live runs parked on that THIS image does not carry.
 *
 * WARNING-ONLY BY RULING, and the ruling is not timidity. This process is the one that would
 * have to run those bodies, and it cannot — but refusing to boot would take the whole estate
 * down over runs that are PARKED, not failing, and that a re-release of the previous image
 * resumes. The honest posture is the one `checks.leader` already takes for a lost advisory lock:
 * say it loudly, keep serving. Fail-open on the READ too — a census that cannot run reports
 * `measured:false`, never a clean zero.
 * @param {{query:Function, carried:ReadonlyArray<string>}} args
 */
export async function strandedBodyCensus({ query, carried }) {
  const runs = await censusNonTerminalRuns(query);
  const stranded = runs.filter((row) => !carried.includes(row.body));
  return {
    measured: true,
    stranded: stranded.reduce((n, row) => n + row.count, 0),
    names: stranded.map((row) => row.body),
    runs: stranded,
  };
}

/**
 * Open ONE connection to the WORLD's database and hand a `query` to `fn`.
 *
 * `makeClient()` (lib/relay.mjs) resolves `DATABASE_URL || WORKFLOW_POSTGRES_URL` and fails
 * closed on a target split. It connects as the BASE login without a SET ROLE, deliberately:
 * `clara_runtime` has no USAGE on the `workflow` schema at all (measured — the WDK world owns
 * it), so a preflight issued through the runtime pool would report a permission error, and a
 * permission error that got swallowed would read as an empty inventory.
 * @param {(query:(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>) => Promise<T>} fn
 * @template T
 */
export async function withWorldClient(fn) {
  const client = makeClient();
  await client.connect();
  try {
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    await client.end().catch(() => {});
  }
}
