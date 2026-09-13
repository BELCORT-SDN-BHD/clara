// #637 (C54.2 / C-70) — THE ROLLBACK PREFLIGHT, executable.
//
// THE DEFECT. "Before rollback, inventory non-terminal `workflow.workflow_runs` and verify the
// target image contains every referenced workflow name/version" has been PROSE in
// packages/runtime/README.md since Wave B, and prose is not a gate. The only executable version of
// it lived inside `tests/version-cutover-e2e.mjs` — a test, not a tool an operator can run against
// a live database before typing `fly deploy --image <previous>`. So the one moment the check exists
// for is the one moment nothing runs it.
//
// WHAT IT COUNTS, AND WHY IT IS TWO CENSUSES RATHER THAN ONE.
//
//   1. NON-TERMINAL `workflow.workflow_runs`, grouped by `name`. A run's `name` is the WDK
//      workflowId (`workflow//./workflows/claraWork.v1//claraWork_v1`), so the BODY it is parked on
//      is derivable FROM THE ROW — never from a hardcoded literal, which is the version-cutover
//      e2e's own hard-won rule (a hardcoded "v8" went stale the moment a later PR repointed the
//      registry, and CI went red silently-until-caught).
//
//   2. LIVE TASKS BOUND TO NO RUN, across BOTH tables that carry that shape. This is the half
//      nothing counted, and the shape is not special to one kind: a task row exists from the moment
//      its admission commits and the run only exists once a worker claims it, so a census of
//      `workflow_runs` alone reports a clean estate while admitted work waits for a body the target
//      does not carry.
//        · `clara.agent_tasks` — `chat_turn` (lib/reconciler.mjs's queued-without-run re-enqueue),
//          `autodraft` (same, its own belt), `accounting_work`, plus the wake-engine kinds
//          (`wake`, `close_prep`) whose class is DB-DRIVEN through
//          `clara.wake_engine_sources.workflow_export` and is therefore READ, never guessed.
//        · `clara.document_processing_tasks` — one class per lane, mirroring
//          `reconciler-documents.mjs`'s own `enqueueForLane` allowlist. Two lanes (`classify`,
//          `local_facts`) ride a consumer LOOP rather than a workflow; they are named as needing
//          NO workflow, because omitting them would make them look unknown and refuse every
//          rollback forever.
//      An unrecognised kind or lane is FAIL-CLOSED: it counts as stranding, because this module
//      cannot prove the target can run something it has never heard of. The STATUS vocabulary is
//      part of the same completeness claim — a wake task is born `held`, so a census of
//      `queued/running/awaiting_input` alone would miss every wake task waiting for its source to
//      enable. Both vocabularies are checked against the relations' own CHECK constraints by
//      tests/rollback-preflight.test.mjs rather than asserted here.
//
// BOTH CENSUSES ALWAYS RUN IN FULL. A `scope` narrows only which rows count toward the SCOPED
// verdict — never which legs are measured. The first cut of this module switched the task census
// OFF whenever a run-shaped scope was given, and the CLI then printed "live tasks bound to NO run:
// 0" — a number it had never looked for. A preflight that reports an unlooked-for zero is worse
// than one that over-refuses, so a leg that is not measured now says `measured:false` and carries
// no count at all.
//
// THE EXIT-CODE VERDICT IS THE GLOBAL ONE, and that is the second half of the same lesson. A scope
// answers "is MY lane clear"; it can never answer "is it safe to release this image", because a
// parked run of another class strands exactly as hard — `--scope-name claraWork` with a parked
// `chatTurn_v18` and a target predating v18 would otherwise exit 0 straight into a crash loop. The
// two verdicts are returned SEPARATELY (`verdict` global, `scoped.verdict` narrowed) and the scoped
// one never widens the global one.
//
// THE SUPPORTED SET COMES FROM THE TARGET IMAGE, NEVER FROM THIS ONE. Two doors, and both answer
// the same question about the artifact rather than about the repo:
//   * `supportedBodiesFromBundle(bundleText)` scans a BUILT bundle for the WDK body directives it
//     actually registers — the same evidence `scripts/check-workflow-bundle.mjs` uses, and the same
//     reason: the bundle is the served artifact, the source is not.
//   * `/api/build-info`'s `bodies` on a running target, which is the registry's own roster.
//   Measured on the current build, the two agree exactly (49 bodies).
//
// FAIL-CLOSED. A read that throws is not "allowed": `preflight()` lets the error out, and the CLI
// exits 2 rather than 1. The one thing this module must never do is answer "go ahead" because it
// could not look.

import { makeClient } from "./relay.mjs";

/** Terminal WDK run statuses. Everything else (`pending`, `running`) is in flight. ONE declaration:
 *  every query below takes these as a parameter rather than repeating the literals (N9). */
export const TERMINAL_RUN_STATUSES = Object.freeze(["completed", "failed", "cancelled"]);

/**
 * `clara.agent_tasks` statuses that still expect a WORKFLOW BODY to run them.
 *
 * `held` is in the list and it is the one that is easy to get wrong. A wake task is BORN held
 * (`_tf_agent_task_insert`'s wake arm, 0011:1230 "a wake task is created held") and only becomes
 * `running` when the wake engine claims it — so the whole window in which a wake task is waiting
 * for its source to enable is a window a `queued/running/awaiting_input` census cannot see. That is
 * the B1 defect in miniature: a leg that exists, is not looked at, and reports zero.
 *
 * `cancel_requested` is deliberately NOT here, and the reason is structural rather than a guess: an
 * unbound `cancel_requested` row is settled terminal by `lib/reconciler.mjs`'s section B without
 * any body being started (`reconciler.mjs:241-274` — cancel, then `settleTaskTerminal`). It needs
 * no workflow from the target image, so counting it would refuse rollbacks for work that is already
 * on its way out.
 *
 * Every status in `clara.agent_tasks`'s own CHECK must appear in exactly one of these two lists;
 * `tests/rollback-preflight.test.mjs` reads the constraint out of the catalog and fails if a future
 * migration adds a status neither list classifies.
 */
export const LIVE_TASK_STATUSES = Object.freeze(["queued", "held", "running", "awaiting_input"]);

/** The other half of that partition: statuses in which a task needs no body from the target image
 *  — terminal, or (cancel_requested) on a settlement path that starts nothing. */
export const TASK_STATUSES_WITHOUT_BODY = Object.freeze([
  "cancel_requested",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

/** `clara.document_processing_tasks` statuses that carry `workflow_run_id IS NULL` by CHECK. */
export const LIVE_DOCUMENT_TASK_STATUSES = Object.freeze(["queued", "held_egress"]);

/**
 * `clara.agent_tasks.kind` -> the registry CLASS that kind's re-enqueue dispatches to.
 *
 * Three of the five kinds bind a STATIC class (the injected `enqueueChatTurn` / `enqueueAutoDraft`
 * / `enqueueClaraWork` deps in plugins/startWorld.ts all resolve through the registry). The other
 * two — `wake` and `close_prep` — are deliberately ABSENT: their class lives in
 * `clara.wake_engine_sources.workflow_export` and is dispatched as `workflowsByName[export]`, so it
 * is a DATABASE fact this module reads rather than a literal it could get wrong.
 */
export const AGENT_TASK_KIND_CLASSES = Object.freeze({
  chat_turn: "chatTurn",
  autodraft: "autoDraft",
  accounting_work: "claraWork",
});

/** The kinds whose class is a DATABASE fact rather than a literal: their dispatcher is
 *  `workflowsByName[source.workflow_export]` (lib/wake-engine.mjs), so this module READS the
 *  source row instead of hardcoding a class for them. Together with the map above these are the
 *  FIVE members of `clara.agent_tasks`'s own kind CHECK; the completeness cell in
 *  tests/rollback-preflight.test.mjs reads that constraint from the catalog and fails when a
 *  migration adds a sixth, so the coverage claim is checked against the schema rather than
 *  asserted. */
export const AGENT_TASK_KINDS_FROM_SOURCES = Object.freeze(["wake", "close_prep"]);

/** `clara.document_processing_tasks.lane` -> registry class. Mirrors reconciler-documents.mjs's own
 *  `enqueueForLane` allowlist exactly; a lane missing from BOTH this map and the set below is
 *  unknown to this module and fails closed. */
export const DOCUMENT_LANE_CLASSES = Object.freeze({
  ocr: "documentIngest",
  structured_parse: "documentIngest",
  none: "documentIngest",
  invoice_facts: "invoiceFacts",
  statement_facts: "statementFacts",
  statement_parse: "statementFacts",
  llm_witness: "witnessFacts",
});

/** Lanes that ride a CONSUMER LOOP rather than a workflow: `classify` has its own leader loop and
 *  must never fall through to documentIngest (that would start real vendor OCR egress), and
 *  `local_facts` is a plain function call. No workflow body can strand either, and saying so
 *  explicitly is what keeps them out of the fail-closed bucket. */
export const DOCUMENT_LANES_WITHOUT_WORKFLOW = Object.freeze(new Set(["classify", "local_facts"]));

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

/** The registry CLASS a body identifier belongs to: `claraWork_v2` -> `claraWork`,
 *  `closeExampleV1` -> `closeExample`. An unversioned identifier is its own class. */
export function classOfBody(identifier) {
  const m = /^(.*?)_?[vV](\d+)$/.exec(String(identifier ?? ""));
  return m ? m[1] : String(identifier ?? "");
}

/** The module stem a body identifier implies: `claraWork_v1` -> `claraWork.v1`. The SAME derivation
 *  scripts/check-workflow-bundle.mjs's resumability rule uses, so the two instruments cannot
 *  disagree about what a body's directive looks like. */
function moduleStemOf(identifier) {
  const m = /^(.*?)_?[vV](\d+)$/.exec(identifier);
  return m ? `${m[1]}.v${m[2]}` : null;
}

/**
 * Every workflow BODY a built bundle registers, read off its WDK directives.
 *
 * The bundle carries a directive string per registered closure, `workflows/<stem>//<export>`. STEP
 * directives share that shape (`workflows/chatTurn.v18.impl//runModelSegmentStepV18`), so the
 * filter is structural rather than a suffix guess: a BODY is a directive whose module stem is
 * exactly the one its own export identifier implies. Measured against the current build this yields
 * exactly the 49 identifiers `registry.ts`'s `workflowBodies` declares, which is the cross-check
 * that makes the derivation trustworthy rather than plausible.
 * @param {string} bundleText
 * @returns {string[]} sorted, de-duplicated
 */
export function supportedBodiesFromBundle(bundleText) {
  const found = new Set();
  if (typeof bundleText !== "string") return [];
  for (const m of bundleText.matchAll(/workflows\/([A-Za-z0-9_.-]+)\/\/([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (moduleStemOf(m[2]) === m[1]) found.add(m[2]);
  }
  return [...found].sort();
}

/**
 * The non-terminal run census, grouped by name. ALWAYS the full picture unless `scope` narrows it,
 * and the narrowing is by run id / name substring only — those are the two selectors a run row can
 * actually be matched on.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {{runIds?:ReadonlyArray<string>|null, nameLike?:string|null}} [scope]
 */
export async function censusNonTerminalRuns(query, scope = {}) {
  const r = await query(
    `select name, count(*)::int as n, min(created_at) as oldest
       from workflow.workflow_runs
      where status::text <> all($1::text[])
        and ($2::text[] is null or id = any($2::text[]))
        and ($3::text is null or name like '%' || $3 || '%')
      group by name
      order by name`,
    [[...TERMINAL_RUN_STATUSES], scope.runIds ?? null, scope.nameLike ?? null],
  );
  return r.rows.map((row) => ({
    name: String(row.name),
    body: bodyIdentifierOf(String(row.name)),
    count: Number(row.n),
    oldest: row.oldest ?? null,
  }));
}

/**
 * THE SOURCE LOOKUP, per row, mirroring `lib/reconciler-wake.mjs`'s own `resolveSource` exactly.
 *
 * Two carriers, and they are not interchangeable. A `wake` task's source is correlated by the
 * ORIGINATING EVENT's type (task -> wake_intents -> domain_events -> the `wake_outbox` source),
 * never by its kind; every other clocked kind (today `close_prep`) is correlated by `task_kind`
 * under the `direct_queue` carrier.
 *
 * LATERAL + `limit 1`, not a plain join, and that is a correctness fix rather than a style one:
 * `wake_engine_sources.source_key` is the PRIMARY KEY and nothing in the schema makes `task_kind`
 * or `event_type` unique (`lib/wake-engine.mjs:155-157` says so in as many words). A plain
 * `left join ... on s.task_kind = t.kind` therefore MULTIPLIES a task row by its registered
 * sources — one disabled predecessor plus its replacement counts the same task twice — and picks
 * whichever class Postgres returned first. The ORDER BY is reconciler-wake.mjs's, verbatim and for
 * its reasons: prefer a currently-ENABLED source, then the most recently registered, then
 * `source_key` as the deterministic tertiary tiebreak.
 */
const AGENT_TASK_SOURCE_LATERALS = `
       left join lateral (
         select s.source_key, s.workflow_export
           from clara.wake_intents wi
           join clara.domain_events de on de.id = wi.event_id
           join clara.wake_engine_sources s on s.event_type = de.event_type and s.carrier = 'wake_outbox'
          where wi.id = t.origin_intent_id
          order by s.enabled desc, s.created_at desc, s.source_key desc
          limit 1
       ) wo on true
       left join lateral (
         select s.source_key, s.workflow_export
           from clara.wake_engine_sources s
          where s.carrier = 'direct_queue' and s.task_kind = t.kind
          order by s.enabled desc, s.created_at desc, s.source_key desc
          limit 1
       ) dq on true`;

/** The class a live `clara.agent_tasks` row's re-enqueue would dispatch to. `sourceClass` is this
 *  row's `clara.wake_engine_sources.workflow_export`, resolved by the laterals above. */
function resolveAgentTaskClass(kind, sourceClass) {
  const stat = AGENT_TASK_KIND_CLASSES[kind];
  if (stat) return { workflowClass: stat, needsWorkflow: true, known: true };
  if (sourceClass) return { workflowClass: String(sourceClass), needsWorkflow: true, known: true };
  // A kind with no static class AND no registered wake source: fail closed. A wake kind whose
  // source row was deleted is exactly this case, and it is a real operational state
  // (reconciler-wake.mjs logs it) — not one to answer optimistically about.
  return { workflowClass: null, needsWorkflow: true, known: false };
}

/** The class a live `clara.document_processing_tasks` row's lane dispatches to. */
function resolveDocumentLaneClass(lane) {
  const mapped = DOCUMENT_LANE_CLASSES[lane];
  if (mapped) return { workflowClass: mapped, needsWorkflow: true, known: true };
  if (DOCUMENT_LANES_WITHOUT_WORKFLOW.has(lane)) return { workflowClass: null, needsWorkflow: false, known: true };
  return { workflowClass: null, needsWorkflow: true, known: false };
}

/**
 * Live tasks bound to NO workflow run, across both tables. ALWAYS measured — `measured:true` is
 * part of the contract, because the whole B1 lesson is that an unlooked-for zero is the worst
 * answer this command can print.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {{workIds?:ReadonlyArray<string>|null, taskIds?:ReadonlyArray<string>|null,
 *          documentTaskIds?:ReadonlyArray<string>|null}} [scope]
 */
export async function censusUnboundTasks(query, scope = {}) {
  const tasks = [];

  const agent = await query(
    `select t.id, t.kind, t.work_id, t.status,
            coalesce(wo.workflow_export, dq.workflow_export) as source_class
       from clara.agent_tasks t${AGENT_TASK_SOURCE_LATERALS}
      where t.status = any($1::text[])
        and t.workflow_run_id is null
        and ($2::uuid[] is null or t.work_id = any($2::uuid[]))
        and ($3::uuid[] is null or t.id = any($3::uuid[]))
      order by t.created_at`,
    [[...LIVE_TASK_STATUSES], scope.workIds ?? null, scope.taskIds ?? null],
  );
  for (const row of agent.rows) {
    const resolved = resolveAgentTaskClass(String(row.kind), row.source_class);
    tasks.push({
      table: "clara.agent_tasks",
      id: String(row.id),
      kind: String(row.kind),
      lane: null,
      workId: row.work_id == null ? null : String(row.work_id),
      status: String(row.status),
      workflowClass: resolved.workflowClass,
      needsWorkflow: resolved.needsWorkflow,
      known: resolved.known,
    });
  }

  const docs = await query(
    `select id, lane, status
       from clara.document_processing_tasks
      where status = any($1::text[])
        and workflow_run_id is null
        and ($2::uuid[] is null or id = any($2::uuid[]))
      order by created_at`,
    [[...LIVE_DOCUMENT_TASK_STATUSES], scope.documentTaskIds ?? null],
  );
  for (const row of docs.rows) {
    const resolved = resolveDocumentLaneClass(String(row.lane));
    tasks.push({
      table: "clara.document_processing_tasks",
      id: String(row.id),
      kind: null,
      lane: String(row.lane),
      workId: null,
      status: String(row.status),
      workflowClass: resolved.workflowClass,
      needsWorkflow: resolved.needsWorkflow,
      known: resolved.known,
    });
  }

  return { measured: true, tasks };
}

/** Does `supported` carry ANY body of this class? An unbound task has not chosen a version yet, so
 *  what it needs from the target is that the class exists there at all. */
export function classIsCarried(supported, className) {
  return supported.some((id) => classOfBody(id) === className);
}

/**
 * Would this unbound task be STRANDED by a target carrying `supported`? ONE predicate, exported,
 * because the verdict and the CLI's refusal listing must never disagree about which rows are the
 * reason for the exit code — the CLI re-derived it with its own inline regex before this, which is
 * two implementations of one rule and the shape a later edit silently breaks.
 * @param {ReadonlyArray<string>} supported
 * @param {{needsWorkflow:boolean, known:boolean, workflowClass:string|null}} task
 */
export function taskIsStranded(supported, task) {
  if (!task.needsWorkflow) return false;
  if (!task.known) return true; // fail closed on a kind/lane this module cannot place
  return !classIsCarried(supported, task.workflowClass);
}

/** The verdict over ONE already-measured census pair. Pure: no database. */
function verdictOver(supported, runs, unbound) {
  const outside = runs.filter((row) => !supported.includes(row.body));
  const stranding = unbound.tasks.filter((t) => taskIsStranded(supported, t));
  const strandedClasses = [...new Set(stranding.map((t) => t.workflowClass).filter((c) => c !== null))].sort();
  const reasons = [];
  if (outside.length > 0) reasons.push("unsupported_body");
  if (stranding.length > 0) reasons.push("unbound_task");
  return {
    verdict: reasons.length === 0 ? "allowed" : "refused",
    reasons,
    runs,
    outside,
    unbound: {
      measured: unbound.measured,
      count: unbound.tasks.length,
      strandedCount: stranding.length,
      strandedClasses,
      tasks: unbound.tasks,
    },
  };
}

/**
 * THE VERDICT. Both censuses always run in FULL; a scope adds a second, narrowed verdict beside the
 * global one and never replaces it.
 *
 * @param {{
 *   query: (sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>,
 *   supported: ReadonlyArray<string>,
 *   scope?: {runIds?:ReadonlyArray<string>|null, nameLike?:string|null, workIds?:ReadonlyArray<string>|null,
 *            taskIds?:ReadonlyArray<string>|null, documentTaskIds?:ReadonlyArray<string>|null},
 * }} args
 */
export async function preflight({ query, supported, scope = {} }) {
  if (typeof query !== "function") throw new TypeError("preflight needs a `query` function");
  if (!Array.isArray(supported)) throw new TypeError("preflight needs a `supported` array of body identifiers");

  const given = Boolean(scope.runIds || scope.nameLike || scope.workIds || scope.taskIds || scope.documentTaskIds);

  // THE FULL PICTURE, ALWAYS. Everything below is filtered from these two reads; nothing is left
  // unmeasured because a flag narrowed something else.
  const allRuns = await censusNonTerminalRuns(query, {});
  const allUnbound = await censusUnboundTasks(query, {});
  const global = verdictOver([...supported], allRuns, allUnbound);

  let scoped = null;
  let derivedRunIds = [];
  if (given) {
    // N8 — a WORK-shaped selector narrows the RUN census too. A Work id or a task id names a
    // task, and a claimed task carries its run id, so the runs the caller is asking about are
    // derivable. Before this, a work-shaped scope left the run census GLOBAL while the output said
    // NARROWED, which is the same class of lie B1 is about.
    if (scope.workIds || scope.taskIds || scope.documentTaskIds) {
      const derived = await query(
        `select workflow_run_id as id from clara.agent_tasks
           where workflow_run_id is not null
             and (($1::uuid[] is null or work_id = any($1::uuid[])) and ($2::uuid[] is null or id = any($2::uuid[])))
             and ($1::uuid[] is not null or $2::uuid[] is not null)
         union
         select workflow_run_id as id from clara.document_processing_tasks
           where workflow_run_id is not null and $3::uuid[] is not null and id = any($3::uuid[])`,
        [scope.workIds ?? null, scope.taskIds ?? null, scope.documentTaskIds ?? null],
      );
      derivedRunIds = derived.rows.map((r) => String(r.id));
    }
    const runIds = scope.runIds ? [...scope.runIds, ...derivedRunIds] : derivedRunIds.length > 0 ? derivedRunIds : null;
    // A work-shaped scope with NO bound run at all must narrow to nothing rather than to
    // everything: an empty id list is the honest filter, not an absent one.
    const scopedRunIds = runIds ?? (scope.workIds || scope.taskIds || scope.documentTaskIds ? [] : null);
    const scopedRuns = await censusNonTerminalRuns(query, { runIds: scopedRunIds, nameLike: scope.nameLike ?? null });
    // EVERY LEG IS FILTERED BY THE CALLER'S SELECTOR FOR THAT LEG, and a leg the caller named
    // nothing for is narrowed to the EMPTY set rather than left global. An absent filter means "all
    // rows" in SQL, so leaving one absent here would quietly fold the whole estate's document
    // backlog into a verdict the caller scoped to one Work — the same class of lie as B1's
    // unlooked-for zero, arriving from the opposite direction. A purely RUN-shaped scope (ids or a
    // name) therefore yields an EMPTY scoped task view that is nonetheless MEASURED, and says so.
    const scopedUnbound = await censusUnboundTasks(query, {
      workIds: scope.workIds ?? null,
      taskIds: scope.taskIds ?? (scope.workIds ? null : []),
      documentTaskIds: scope.documentTaskIds ?? [],
    });
    scoped = verdictOver([...supported], scopedRuns, scopedUnbound);
  }

  return {
    // THE AUTHORITY. The CLI's exit code follows this, never the scoped one.
    verdict: global.verdict,
    reasons: global.reasons,
    runs: global.runs,
    outside: global.outside,
    unbound: global.unbound,
    supported: [...supported],
    scope: {
      given,
      runIds: scope.runIds ?? null,
      nameLike: scope.nameLike ?? null,
      workIds: scope.workIds ?? null,
      taskIds: scope.taskIds ?? null,
      documentTaskIds: scope.documentTaskIds ?? null,
      derivedRunIds,
    },
    scoped,
  };
}

/**
 * The BOOT-TIME half: which bodies live runs are parked on that THIS image does not carry.
 *
 * Fail-open on the READ — a census that cannot run reports nothing rather than a clean zero (the
 * caller records `measured:false`). What the caller DOES with a non-zero count is the caller's
 * ruling: plugins/startWorld.ts refuses to start the world (#637 review S5), because an engine that
 * re-enqueues a run whose body it does not export raises `ReplayDivergenceError` and takes the
 * crash-only process down — a restart loop, not a quiet park.
 * @param {{query:Function, carried:ReadonlyArray<string>}} args
 * @returns {Promise<{measured:boolean, stranded:number, names:string[], runs:Array<{name:string, body:string, count:number, oldest:unknown}>}>}
 */
export async function strandedBodyCensus({ query, carried }) {
  const runs = await censusNonTerminalRuns(query, {});
  const stranded = runs.filter((row) => !carried.includes(row.body));
  return {
    measured: true,
    stranded: stranded.reduce((n, row) => n + row.count, 0),
    names: stranded.map((row) => row.body),
    runs: stranded,
  };
}

/**
 * The boot census, taken on its OWN short-lived connection to the world's database.
 *
 * A named wrapper rather than an inline `withWorldClient(...)` at the call site, and the reason is a
 * real one rather than tidiness: `plugins/startWorld.ts` is TYPESCRIPT importing this plain-ESM
 * module, and a generic `@template T` does not survive that boundary (tsc resolves the result as
 * `unknown`). An explicit `@returns` here gives the TS caller a concrete shape without a cast at
 * the call site — and a cast is exactly the thing this estate's own freeze-lint comments call
 * untraceable.
 *
 * @param {ReadonlyArray<string>} carried the body identifiers THIS image exports
 * @returns {Promise<{measured:boolean, stranded:number, names:string[], runs:Array<{name:string, body:string, count:number, oldest:unknown}>}>}
 */
export async function strandedBodyCensusOnWorld(carried) {
  return withWorldClient((query) => strandedBodyCensus({ query, carried }));
}

/**
 * Open ONE connection to the WORLD's database and hand a `query` to `fn`.
 *
 * `makeClient()` (lib/relay.mjs) resolves `DATABASE_URL || WORKFLOW_POSTGRES_URL` and fails closed
 * on a target split. It connects as the BASE login without a SET ROLE, deliberately:
 * `clara_runtime` has no USAGE on the `workflow` schema at all (measured — the WDK world owns it),
 * so a preflight issued through the runtime pool would report a permission error, and a permission
 * error that got swallowed would read as an empty inventory.
 * @template T
 * @param {(query:(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>) => Promise<T>} fn
 * @returns {Promise<T>}
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
