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
// AND THE TARGET DECLARES ONE MORE THING ABOUT ITSELF (#1035): which DOOR CONTRACTS it
// understands. `supportedContractsFromBundle(bundleText)` reads the `clara.contract` markers
// `lib/runtime-contracts.mjs` puts in the artifact, and `/api/build-info`'s `contracts` is the same
// roster on a running target. A body roster answers "can this image RUN the parked work"; this
// answers "does it READ what the doors now return", which is the question a schema change to a
// door's return contract poses and no census can reach.
//
// AND THE DATABASE HAS A VOTE OF ITS OWN — THE FRONTIER RULES (wave-3, #815; widened by #1035).
// Both censuses above ask "is anything IN FLIGHT that the target cannot run". They cannot see a
// rule that lives in the SCHEMA. There are two kinds, in one table, and the second is the one that
// cost two hosted windows.
//
//   (a) A BODY THE SCHEMA REQUIRES. Migration 0195 is the first: its recut
//       `clara._record_journal_entry_core` refuses an accounting write whose run holds no consumed
//       `accounting_work` egress authorisation, and the FIRST body that can obtain one is
//       `claraWork_v3` (`prepare_work_egress_dispatch`/`consume_egress_dispatch` are called from
//       `workflows/claraWork.v3.impl.ts`, and from `claraWork.v4.impl.ts` since the wave
//       2026-09-15 cut — from no body before v3). 0195 GRANDFATHERS runs claimed under a pre-v3
//       bundle so a forward cutover finishes honestly — which means a rollback to a pre-v3 image
//       would run the whole Work lane through the grandfather arm, i.e. WITHOUT the egress wall,
//       on a database whose frontier says the wall is in force. Reason `frontier_requires_body`.
//
//   (b) A DOOR CONTRACT THE SCHEMA CHANGED. From `0254_intake_refusal_record`,
//       `clara.create_document_intake` COMMITS a ceiling-refused intake and returns `refused: true`
//       instead of raising CLR18; from `0279_fa_closed_year_arrears`,
//       `clara.run_depreciation_period` answers `parked` instead of posting. An image from before
//       either one carries every body, strands nothing, and MISREADS the answer — 201 to an
//       uploader whose file the ceiling turned away, or a park counted as a post and re-driven on
//       every sweep. The rule refuses a target that does not DECLARE the contract; reason
//       `frontier_requires_contract`, and neither of a census refusal's two answers reaches it —
//       retaining a body teaches the target nothing about what the door returns, and there is no
//       queue to drain.
//
// NEITHER IS SOMETHING A PARKED RUN CAN TELL YOU ABOUT: with the lane fully drained the run census
// is clean and every other leg says ALLOWED — which is exactly what was recorded at two hosted
// windows for (b) (docs/plan/active/riders-2026-09-20/RELEASE-W2-RUNBOOK.md § RESULTS step 9, and
// RELEASE-W3-RUNBOOK.md step 9). So both are measured directly — the database's own frontier
// against the target's own two rosters — and both are GLOBAL: they refuse regardless of scope,
// because a scope narrows which ROWS are counted and these rules count no rows at all.
//
// FAIL-CLOSED. A read that throws is not "allowed": `preflight()` lets the error out, and the CLI
// exits 2 rather than 1. The one thing this module must never do is answer "go ahead" because it
// could not look.

import { makeClient } from "./relay.mjs";

/** Terminal WDK run statuses. Everything else (`pending`, `running`) is in flight. ONE declaration:
 *  every query below takes these as a parameter rather than repeating the literals (N9). */
export const TERMINAL_RUN_STATUSES = Object.freeze(["completed", "failed", "cancelled"]);

/**
 * MIGRATIONS WHOSE RULE THE IMAGE MUST SATISFY — the frontier rule's whole content, as DATA.
 *
 * Once the database frontier is at or past `migration`, a target image that does not carry every
 * identifier in `requires` AND every id in `requiresContracts` is REFUSED, whatever the run census
 * says. A later cutover that puts a rule of either shape in the schema adds a ROW here; it does
 * not touch the verdict code, and tests/rollback-preflight.test.mjs reads this table rather than
 * restating it.
 *
 * TWO KINDS OF REQUIREMENT, ONE TABLE (#1035).
 *   · `requires` names BODY IDENTIFIERS (`claraWork_v3`), the vocabulary
 *     `supportedBodiesFromBundle` and `/api/build-info`'s `bodies` speak. The comparison is exact
 *     rather than class-shaped: `claraWork_v2` does not satisfy a rule that names `claraWork_v3`.
 *   · `requiresContracts` names CONTRACT IDS (`intake_refusal_record_v1`), the vocabulary
 *     `supportedContractsFromBundle` and `/api/build-info`'s `contracts` speak — declared by
 *     `lib/runtime-contracts.mjs`. This is the rule for a migration that changed what a DOOR
 *     RETURNS: the target can run every parked body and still MISREAD the answer it gets.
 *
 * WHY BOTH LISTS ARE ALWAYS PRESENT, even when empty: a row that omitted one would be read as
 * requiring nothing of that kind, and the omission and the empty list would be indistinguishable
 * at the exact moment somebody adds a rule in a hurry.
 *
 * WHY THE IDS ARE BARE HERE AND PREFIXED IN THE ROSTER. This module ships inside the runtime
 * bundle too (plugins/startWorld.ts imports its boot census), so a rule spelling the scannable
 * marker form would put that marker in every image carrying the rule — and the scan would then
 * find a declaration the image never made. The rule names the id; only the roster names the marker.
 */
export const FRONTIER_RULES = Object.freeze([
  Object.freeze({
    migration: "0195_work_egress_purpose_and_execution_trace",
    requires: Object.freeze(["claraWork_v3"]),
    requiresContracts: Object.freeze([]),
    why:
      "0195's recut clara._record_journal_entry_core requires a consumed accounting_work egress "
      + "authorisation at the accounting write, and claraWork_v3 is the FIRST body that obtains one "
      + "(prepare_work_egress_dispatch / consume_egress_dispatch are called from "
      + "workflows/claraWork.v3.impl.ts, and from claraWork.v4.impl.ts since the wave 2026-09-15 "
      + "cut — from no body before v3, which is why the rule names v3 and not the newest one). A "
      + "target without it would run the Work lane entirely through 0195's pre-v3 grandfather arm "
      + "— the wall in force, and nothing subject to it.",
  }),
  Object.freeze({
    migration: "0254_intake_refusal_record",
    requires: Object.freeze([]),
    requiresContracts: Object.freeze(["intake_refusal_record_v1"]),
    why:
      "From 0254 clara.create_document_intake COMMITS a ceiling-refused intake and RETURNS "
      + "refused:true; before it, the door raised CLR18 and the freshly inserted row rolled back "
      + "with the transaction. An image that does not read the flag takes the refusal receipt for "
      + "an accepted intake: it reads an intake_id off it, mints an upload capability, answers 201 "
      + "to the uploader for a file the firm's daily ceiling turned away, and leaves a sidecar the "
      + "recovery sweep re-drives on every pass until its TTL expires it. The run census cannot "
      + "see this: nothing is parked, and the estate reads clean (RELEASE-W2-RUNBOOK.md § RESULTS, "
      + "step 9, 2026-09-23 — ALLOWED, and it should not have been).",
  }),
  Object.freeze({
    migration: "0279_fa_closed_year_arrears",
    requires: Object.freeze([]),
    requiresContracts: Object.freeze(["fa_parked_run_v1"]),
    why:
      "From 0279 clara.run_depreciation_period answers status:'parked' instead of posting when the "
      + "charge would fold a closing or closed fiscal year's months into the open period and nobody "
      + "has judged their materiality (IAS 8 leaves that judgement to the accountant). An image "
      + "that does not know the status counts the park as a POST — the belt reports work it never "
      + "did — and because the due probe still answers due:true, honestly, it keeps chasing the "
      + "same period to the per-client cap, banking one parked receipt per call "
      + "(RELEASE-W3-RUNBOOK.md, step 9: the same gap, a second time).",
  }),
]);

/** The leading 4-digit ordinal of a `clara.schema_migrations.version` (`0195_work_egress…` -> 195).
 *  `null` when the string does not carry one — which the caller treats as FAIL-CLOSED rather than
 *  as "no migrations", because an unreadable frontier is not an early one. */
export function migrationOrdinal(version) {
  const m = /^(\d{4})/.exec(String(version ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * THE FRONTIER RULE, pure. What is this target missing, given this frontier?
 *
 * ONE function over BOTH requirement kinds, because they are one question asked of one table: an
 * image is a lawful target only if it can run what is parked AND read what the doors return. A
 * violation says WHICH kind it is (`requirement`), so the CLI can print the right sentence and the
 * verdict can carry two distinct reasons — a missing body is drainable state, a missing contract
 * is a rule in the applied schema and nothing drains it.
 *
 * @param {string|null} frontierVersion the database's max `clara.schema_migrations.version`
 * @param {{bodies?:ReadonlyArray<string>, contracts?:ReadonlyArray<string>}} carried what the
 *        TARGET image declares: its body identifiers and its contract ids
 * @param {ReadonlyArray<{migration:string, requires:ReadonlyArray<string>,
 *        requiresContracts:ReadonlyArray<string>, why?:string}>} [rules]
 * @returns {Array<{migration:string, requirement:"body"|"contract", body:string|null,
 *        contract:string|null, why:string|null}>}
 */
export function frontierRuleViolations(frontierVersion, carried = {}, rules = FRONTIER_RULES) {
  // A database with NO migrations applied carries none of these rules, and saying so is honest
  // rather than lax: the schema the rule is about does not exist yet. An UNREADABLE version is the
  // other case entirely — every rule applies, because this module cannot prove one does not.
  if (frontierVersion === null || frontierVersion === undefined) return [];
  const at = migrationOrdinal(frontierVersion);
  const bodies = new Set((carried.bodies ?? []).map(String));
  const contracts = new Set((carried.contracts ?? []).map(String));
  const out = [];
  for (const rule of rules) {
    const needsFrom = migrationOrdinal(rule.migration);
    if (at !== null && needsFrom !== null && at < needsFrom) continue;
    for (const body of rule.requires ?? []) {
      if (!bodies.has(body)) out.push({ migration: rule.migration, requirement: "body", body, contract: null, why: rule.why ?? null });
    }
    for (const contract of rule.requiresContracts ?? []) {
      if (!contracts.has(contract)) {
        out.push({ migration: rule.migration, requirement: "contract", body: null, contract, why: rule.why ?? null });
      }
    }
  }
  return out;
}

/**
 * CONTRACT IDS THIS IMAGE DECLARES BEFORE THE MIGRATION THAT WILL REQUIRE THEM HAS A RULE — the
 * deliberate, temporary state `lib/runtime-contracts.mjs`'s own rule 3 already allows: a contract
 * can ship in `RUNTIME_CONTRACTS` before the migration that makes reading it mandatory lands a row
 * in `FRONTIER_RULES`. Listing an id here is the record that the gap is INTENDED right now — an id
 * that is neither ruled nor listed here is one `contractsMissingFrontierRule` (#1129) refuses to
 * pass over in silence.
 */
export const CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE = Object.freeze([]);

/**
 * THE OTHER DIRECTION OF THE SAME TABLE (#1129, a follow-up from #1035's own report). Once the
 * `FRONTIER_RULES` row lands, `frontierRuleViolations` catches it naming a contract this image
 * never declares. Nothing before this caught the reverse: `RUNTIME_CONTRACTS` growing an entry
 * whose migration NEVER gets a rule — legal on its own (an unruled contract refuses nobody, so it
 * is not itself a defect), but silent, and a roster entry that was meant to get a rule eventually
 * could sit forever with nothing reminding anyone it still owed one.
 *
 * A contract id comes back from this function when its roster entry has NEITHER a `FRONTIER_RULES`
 * row naming it in `requiresContracts` NOR an entry in `exceptions`. The check does not require the
 * SAME migration number on both sides — only that some rule, at some frontier, will eventually
 * refuse an image that does not carry the marker; which migration a contract's rule lands at is the
 * cutover's own choice, not a constraint this guard enforces.
 *
 * THIS MODULE DOES NOT IMPORT `RUNTIME_CONTRACTS` ITSELF, for the same boundary reason the rule
 * table above keeps its ids bare rather than prefixed: `lib/rollback-preflight.mjs` ships inside the
 * runtime bundle (`plugins/startWorld.ts` imports its boot census), and a roster this module pulled
 * in on its own would ship there too, unused, rather than staying the caller's own choice of which
 * roster to compare. The caller (a test, a lint step) passes `RUNTIME_CONTRACTS` in.
 *
 * @param {ReadonlyArray<{id:string}>} contracts the runtime-contract roster to check (typically
 *        `RUNTIME_CONTRACTS` from `lib/runtime-contracts.mjs`)
 * @param {ReadonlyArray<{requiresContracts?:ReadonlyArray<string>}>} [rules]
 * @param {ReadonlyArray<string>} [exceptions]
 * @returns {string[]} ids with neither a rule nor a listed exception, in roster order
 */
export function contractsMissingFrontierRule(contracts, rules = FRONTIER_RULES, exceptions = CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE) {
  if (!Array.isArray(contracts)) throw new TypeError("contractsMissingFrontierRule needs a `contracts` array");
  const ruled = ruledContractIds(rules);
  const excepted = new Set(exceptions);
  return contracts.filter((c) => !ruled.has(c.id) && !excepted.has(c.id)).map((c) => c.id);
}

function ruledContractIds(rules) {
  return new Set(rules.flatMap((r) => r.requiresContracts ?? []));
}

/**
 * THE OTHER END OF THE SAME EXCEPTION LIST (#1129, review round ADV-L06-09) — every id in
 * `exceptions` that now HAS a `FRONTIER_RULES` row naming it, i.e. every exception that has
 * outlived its reason.
 *
 * `contractsMissingFrontierRule` alone was write-only. An entry is listed there precisely because
 * its rule has not landed YET, so the NORMAL end of its life is the migration that lands the rule —
 * and nothing told anyone the entry was dead afterwards. That is the same "sits forever, silently"
 * failure the roster half exists to catch, moved onto the list that excuses it: the list could
 * quietly accumulate ids nobody could tell apart from live ones. With both directions checked, the
 * PR that adds a contract's rule is the PR that has to drop its exception.
 *
 * @param {ReadonlyArray<{requiresContracts?:ReadonlyArray<string>}>} [rules]
 * @param {ReadonlyArray<string>} [exceptions]
 * @returns {string[]} excepted ids that are ruled after all, in the exception list's own order
 */
export function deadContractRuleExceptions(rules = FRONTIER_RULES, exceptions = CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE) {
  const ruled = ruledContractIds(rules);
  return [...exceptions].filter((id) => ruled.has(id));
}

/**
 * ONE DESCRIPTION OF ONE VIOLATION — the reason it is refused under, the thing the applied schema
 * requires, the verb by which an image has it, and what the target does not do with it.
 *
 * Both things that print a violation read this: the verdict's own refusal lines below, and the
 * CLI's per-violation line inside `printFrontier`. That is the reason `refusalFooterLines` and
 * `taskIsStranded` already state in this file — a second inline copy of a rule drifts from the
 * verdict that used it — applied to the one place that still had one (review F1): a third kind of
 * rule must be unable to reach one output path and miss the other.
 * @param {{requirement:string, body:string|null, contract:string|null}} v
 * @returns {{reason:string, verb:string, needs:string, lack:string}}
 */
export function frontierViolationPhrase(v) {
  return v.requirement === "contract"
    ? {
      reason: "frontier_requires_contract",
      verb: "understand",
      needs: `the ${v.contract} door contract`,
      lack: "does NOT declare",
    }
    : { reason: "frontier_requires_body", verb: "carry", needs: `${v.body}`, lack: "does NOT carry" };
}

/**
 * THE FRONTIER REFUSAL, as the lines an operator reads — one per violation, naming the rule, the
 * migration and the thing the target does not carry.
 *
 * A PURE EXPORT rather than a loop inside the CLI, for the reason `refusalFooterLines` and
 * `taskIsStranded` already state in this file: a second inline copy of a rule drifts from the
 * verdict, and the worst available failure mode is a refusal whose printed reasons do not match
 * the one that caused it.
 * @param {{frontier:{version:string|null, violations:ReadonlyArray<object>}}} result
 * @returns {string[]}
 */
export function frontierRefusalLines(result) {
  const at = result.frontier.version ?? "an UNREADABLE frontier";
  return result.frontier.violations.map((v) => {
    const p = frontierViolationPhrase(v);
    const head = `  - ${p.reason}: this database is at ${at}, and ${v.migration} requires the image to `
      + `${p.verb} ${p.needs}, which the target ${p.lack}.`;
    return v.why ? `${head}\n      ${v.why}` : head;
  });
}

/** The database's migration frontier: `max(version)` over `clara.schema_migrations` — the same
 *  ledger and the same aggregate `clara.build_frontier()` (0174) reports to `/api/build-info`,
 *  read directly here because this module's connection is the BASE login and that door is granted
 *  to `clara_runtime` alone. NEVER swallowed: a read that throws leaves `preflight()` through the
 *  same path every other read does, and the CLI exits 2. */
export async function readMigrationFrontier(query) {
  const r = await query("select max(version) as version from clara.schema_migrations");
  const v = r.rows[0]?.version;
  return v === undefined || v === null ? null : String(v);
}

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
  // RIDERS WAVE 4 — the two lanes #926's owner ruling (2026-09-18, option G) reopened.
  // `payroll_facts` (#945 / 0296) and `contract_facts` (#948 / 0299) are in
  // `ck_processing_task_lane_f_a1` and in reconciler-documents.mjs's `enqueueForLane` allowlist,
  // which this map claims in its own cell to mirror EXACTLY — and both were missed here. The
  // consequence is not a safety hole (an unmapped lane falls into the fail-closed `known:false`
  // bucket) but a wrong answer: a live payroll or contract task would read to a rollback
  // preflight as a lane this image has never heard of, refusing a rollback it should have
  // allowed and saying nothing useful about why. Class names are the registry's own
  // (`workflowPins.payrollFacts` / `.agreementFacts`), never re-spelled.
  payroll_facts: "payrollFacts",
  contract_facts: "agreementFacts",
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
 * #1035 — Every DOOR CONTRACT a built bundle declares it understands, read off its own literals.
 *
 * The body scan above answers "can this image RUN the parked work". It cannot answer the other
 * question a rollback has to ask: does this image READ WHAT THE DOORS NOW RETURN. `lib/runtime-
 * contracts.mjs` is where an image declares that, one `clara.contract` marker per contract, and
 * this is the reading half — the same evidence class as the body directives, for the same reason:
 * the artifact is what ships, the source tree is not.
 *
 * ZERO MARKERS IS A REAL AND COMMON ANSWER, unlike zero bodies. Every image built before this
 * mechanism existed carries none, and that is precisely the target a rollback points at — so the
 * caller must NOT treat an empty result as an unreadable bundle.
 *
 * The regex wants the prefix FOLLOWED BY an id. The bare prefix constant is itself in any bundle
 * carrying the roster module, and reading that as a declaration would hand every image a contract
 * it never named.
 * @param {string} bundleText
 * @returns {string[]} contract ids, sorted and de-duplicated
 */
export function supportedContractsFromBundle(bundleText) {
  if (typeof bundleText !== "string") return [];
  const found = new Set();
  for (const m of bundleText.matchAll(/clara\.contract\/\/([a-z][a-z0-9_]*_v\d+)/g)) found.add(m[1]);
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
 *
 * #1015 — THE DOCUMENT LANE'S OWN SCOPING RULE, which is not the agent lane's. `clara.
 * document_processing_tasks` carries no `work_id`/`task_id` column, so `workIds`/`taskIds` name
 * nothing that table could filter on. A caller who names either (an AGENT-shaped scope) and
 * leaves `documentTaskIds` OUT of the scope object entirely narrows the document lane to NONE —
 * not to "every row", which is what an absent filter means in SQL and was this function's actual
 * defect. `documentTaskIds` PRESENT in the scope object — even as `null` — is the caller
 * explicitly asking for the document lane's own full, unscoped picture regardless of what else is
 * scoped; presence of the key, not its value, is the signal. An entirely EMPTY scope (`{}`, or no
 * `scope` at all — neither table is scoped by anything) is the same explicit ask from the other
 * side, and is how `preflight()`'s GLOBAL census and `tests/queue-drain.mjs` get the full picture.
 *
 * #1151 — `firmIds` IS A SEPARATE, ORTHOGONAL DIMENSION, not a third member of the
 * agent-shaped/document-shaped pair above. Both tables carry their own `firm_id` natively (unlike
 * `work_id`/`task_id`, which the document table has no column for at all), so naming `firmIds`
 * narrows BOTH halves by the same firms directly — it never trips the `documentTaskIds`
 * presence rule above, and an absent `firmIds` (the default) changes nothing about either half's
 * existing behaviour. This is what lets a caller such as `tests/queue-drain.mjs` ask "is THIS
 * leg's own work drained" without being answered by another firm's unrelated backlog on the same
 * database — the estate's own `clara.agent_tasks.firm_id` / `clara.document_processing_tasks.
 * firm_id` are read-only inputs here; no door and no migration.
 * @param {(sql:string, params?:unknown[]) => Promise<{rows:Array<Record<string, unknown>>}>} query
 * @param {{workIds?:ReadonlyArray<string>|null, taskIds?:ReadonlyArray<string>|null,
 *          documentTaskIds?:ReadonlyArray<string>|null, firmIds?:ReadonlyArray<string>|null}} [scope]
 */
export async function censusUnboundTasks(query, scope = {}) {
  const tasks = [];
  const firmIds = scope.firmIds ?? null;

  const agent = await query(
    `select t.id, t.kind, t.work_id, t.status,
            coalesce(wo.workflow_export, dq.workflow_export) as source_class
       from clara.agent_tasks t${AGENT_TASK_SOURCE_LATERALS}
      where t.status = any($1::text[])
        and t.workflow_run_id is null
        and ($2::uuid[] is null or t.work_id = any($2::uuid[]))
        and ($3::uuid[] is null or t.id = any($3::uuid[]))
        and ($4::uuid[] is null or t.firm_id = any($4::uuid[]))
      order by t.created_at`,
    [[...LIVE_TASK_STATUSES], scope.workIds ?? null, scope.taskIds ?? null, firmIds],
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

  // #1015 — no filter is NOT the same question as no correspondence. `clara.document_processing_
  // tasks` carries no work_id/task_id column at all, so a caller who scoped the AGENT half by
  // taskIds/workIds has given the document half nothing it could legitimately match against —
  // the honest answer for that half is NONE, not EVERYTHING. A caller that wants the full,
  // unscoped document picture regardless must ASK, by naming the `documentTaskIds` key at all
  // (even as `null`) — presence, not value, is what distinguishes "not requested" from
  // "explicitly requesting the unscoped full census" (the Agent Brief's own two cases).
  const agentScoped = scope.workIds != null || scope.taskIds != null;
  const docScopeGiven = Object.prototype.hasOwnProperty.call(scope, "documentTaskIds");
  const documentTaskIds = docScopeGiven ? (scope.documentTaskIds ?? null) : (agentScoped ? [] : null);
  const docs = await query(
    `select id, lane, status
       from clara.document_processing_tasks
      where status = any($1::text[])
        and workflow_run_id is null
        and ($2::uuid[] is null or id = any($2::uuid[]))
        and ($3::uuid[] is null or firm_id = any($3::uuid[]))
      order by created_at`,
    [[...LIVE_DOCUMENT_TASK_STATUSES], documentTaskIds, firmIds],
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

/**
 * #637 review SHOULD-3 — THE REFUSAL FOOTER'S CLOSING LINES, exported for the same reason
 * `taskIsStranded` is: the CLI's rendering must never disagree with what actually happened.
 *
 * `taskIsStranded` returns true for an UNPLACEABLE task (`known:false` — a `wake`/`close_prep` row
 * whose event type has no enabled `clara.wake_engine_sources` row) regardless of `supported`. The
 * two ways the runbook names — RETAIN every non-terminal bundle in the target, or DRAIN first — are
 * both a promise about a NAMED body, and neither is reachable for a row this command could not even
 * identify: you cannot retain or drain towards a class with no name. Printing the two-way footer
 * unchanged for that row is not wrong about the verdict (it still refuses), only about the closing
 * advice, which is exactly the shape a runbook must never get wrong.
 *
 * So: two ways forward when every stranding row NAMES a class the target could carry either way.
 * A THIRD when at least one stranded row is unplaceable — register (or repair) the task's
 * `clara.wake_engine_sources` row so it resolves to a body again, or retire the task if it is not
 * meant to run. This changes NOTHING about the verdict or the exit code; it only makes the footer
 * honest about which rows the two named ways can actually satisfy.
 * @param {ReadonlyArray<string>} supported
 * @param {{unbound:{tasks:ReadonlyArray<{table:string,id:string,kind:string|null,lane:string|null,status:string,workflowClass:string|null,needsWorkflow:boolean,known:boolean}>}}} result
 * @returns {string[]}
 */
export function refusalFooterLines(supported, result) {
  const stranding = result.unbound.tasks.filter((t) => taskIsStranded(supported, t));
  const unplaceable = stranding.filter((t) => !t.known);
  if (unplaceable.length === 0) {
    return [
      "\nThe two admissible ways forward are the ones the runbook names: RETAIN every non-terminal bundle in the target " +
        "(ship a compatibility build that still exports these bodies while new admission points at the previous version), " +
        "or DRAIN first and re-run this command until it allows. Elapsed time is not a drain.",
    ];
  }
  const rows = unplaceable.map((t) => `${t.table} ${t.id}`).join(", ");
  return [
    `\nAt least one stranded task is UNPLACEABLE — this command could not identify a workflow class for it (${rows}). ` +
      "For those rows the two admissible ways the runbook names do not apply: you cannot RETAIN or DRAIN towards a body " +
      "with no name. The way forward for THOSE rows is a THIRD one — register (or repair) the task's " +
      "`clara.wake_engine_sources` row so it resolves to a body again, or retire the task if it is not meant to run. " +
      "Any OTHER stranded row above that DOES name a class can still be carried by RETAIN or cleared by DRAIN.",
  ];
}

/**
 * The verdict over ONE already-measured census pair. Pure: no database.
 *
 * `frontierViolations` is passed ONLY for the global view, and that is the rule rather than an
 * oversight. A scoped verdict answers "is MY lane clear" — it is defined over the rows the caller
 * named — and the frontier rule is about no rows at all, so folding it in would make a scoped
 * answer refuse for a reason the scope cannot affect and cannot clear. It lands where the exit
 * code is taken instead: the GLOBAL verdict, which is the release decision (#637 review B2).
 */
function verdictOver(supported, runs, unbound, frontierViolations = []) {
  const outside = runs.filter((row) => !supported.includes(row.body));
  const stranding = unbound.tasks.filter((t) => taskIsStranded(supported, t));
  const strandedClasses = [...new Set(stranding.map((t) => t.workflowClass).filter((c) => c !== null))].sort();
  const reasons = [];
  if (outside.length > 0) reasons.push("unsupported_body");
  if (stranding.length > 0) reasons.push("unbound_task");
  // TWO FRONTIER REASONS, NOT ONE (#1035). A missing BODY and a misread DOOR CONTRACT are both
  // rules in the applied schema, but they are different facts about the target and an operator
  // reading the exit needs to tell them apart: one is answered by a compatibility build that
  // retains the body, the other only by an image that declares the contract.
  if (frontierViolations.some((v) => v.requirement !== "contract")) reasons.push("frontier_requires_body");
  if (frontierViolations.some((v) => v.requirement === "contract")) reasons.push("frontier_requires_contract");
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
 *   frontier?: string|null,
 * }} args
 *
 * `frontier` is the database's `clara.schema_migrations` max version. Omit it and this function
 * READS it — that is the production path, and it is one read. Pass it (a version string, or `null`
 * for "nothing applied") only where the caller is asking the question about a frontier other than
 * the connected database's: the pure unit cells do exactly that, and nothing else should.
 *
 * `contracts` (#1035) is the TARGET's contract-id roster, from `supportedContractsFromBundle` or
 * from `/api/build-info`'s `contracts`. It DEFAULTS TO EMPTY, and that default is fail-closed on
 * purpose: an image that declares nothing is exactly the image the two 2026-09-23 windows were
 * pointed at, and the honest reading of "no declaration" is "does not understand", never "fine".
 */
export async function preflight({ query, supported, contracts = [], scope = {}, frontier }) {
  if (typeof query !== "function") throw new TypeError("preflight needs a `query` function");
  if (!Array.isArray(supported)) throw new TypeError("preflight needs a `supported` array of body identifiers");
  if (!Array.isArray(contracts)) throw new TypeError("preflight needs a `contracts` array of contract ids");

  const given = Boolean(scope.runIds || scope.nameLike || scope.workIds || scope.taskIds || scope.documentTaskIds);

  // THE FULL PICTURE, ALWAYS. Everything below is filtered from these two reads; nothing is left
  // unmeasured because a flag narrowed something else.
  const allRuns = await censusNonTerminalRuns(query, {});
  const allUnbound = await censusUnboundTasks(query, {});
  // THE DATABASE'S OWN VOTE. Read here rather than at the call sites so every caller — the CLI,
  // the drills, a pipeline — gets it without opting in; a rule you have to remember to ask for is
  // a rule that is not enforced.
  const frontierVersion = frontier === undefined ? await readMigrationFrontier(query) : frontier ?? null;
  const frontierViolations = frontierRuleViolations(frontierVersion, { bodies: [...supported], contracts: [...contracts] });
  const global = verdictOver([...supported], allRuns, allUnbound, frontierViolations);

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
    // THE FRONTIER RULE's own leg, reported beside the two censuses and never folded into them:
    // `version` is what the database says, `violations` is what the TARGET is missing because of
    // it. An empty `violations` with a non-null `version` is a measured pass, not an unlooked-for
    // zero — `rules` names what was actually checked.
    frontier: {
      version: frontierVersion,
      measured: true,
      violations: frontierViolations,
      rules: FRONTIER_RULES.map((r) => r.migration),
      // WHAT WAS MEASURED ON THE TARGET SIDE, echoed for the same reason the unbound census refuses
      // an unlooked-for zero: an empty `violations` beside an empty `contracts` on a pre-0254
      // database is a pass, and on a 0254 database it would be a bug — the reader can tell.
      contracts: [...contracts],
    },
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
