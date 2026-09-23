// #637 (C54.2) — the rollback preflight, against a REAL Postgres rig under the real relations.
//
// WHAT THESE CELLS PROVE, and why each needs a database rather than a stub:
//
//   * A non-terminal run on a body the TARGET image does not carry REFUSES the rollback, and the
//     refusal NAMES the body. Derived from the run row's own `name`, never from a literal — the
//     version-cutover e2e's hard-won rule (a hardcoded version went stale the moment a later PR
//     repointed the registry).
//   * A live task bound to NO workflow run refuses ON ITS OWN, for EVERY kind that has a workflow
//     class — not just `accounting_work`. Those tasks exist before any run does, so a census of
//     `workflow.workflow_runs` alone reports a clean estate while admitted work waits for a body
//     the target does not carry. The shape is shared: `clara.agent_tasks` (chat_turn, autodraft,
//     accounting_work, plus the DB-driven wake-engine kinds) and `clara.document_processing_tasks`
//     (one class per lane) both carry it.
//   * BOTH CENSUSES ALWAYS RUN IN FULL, and a scope narrows only which rows count toward the
//     SCOPED verdict — never which legs are measured. A preflight that stopped measuring a leg
//     because a flag narrowed a different one would print a zero it never looked for, which is the
//     worst output this command can produce.
//   * THE EXIT-CODE VERDICT IS THE GLOBAL ONE. A scope answers "is MY lane clear"; it can never
//     answer "is it safe to release this image", because a parked run of another class strands
//     just as hard. The two verdicts are reported separately and the scoped one never widens the
//     global one.
//   * SCOPE (#708). Unrelated parked runs of another workflow name must not decide the scoped
//     verdict — that is the defect filed as #708, reproduced here as a pass/fail line.
//   * THE FRONTIER RULE (wave-3, #815). A rule that lives in the APPLIED SCHEMA and needs a body
//     in the image refuses on its own, with no rows in flight at all — which is exactly the case
//     neither census can see. Its cells are PURE (an explicit `frontier`, a stub `query`): the
//     rule is about a version string and a roster, and making them need a rig would make them
//     measure the rig instead of the rule.
//
// GATED, positively, on the catalog. `node --test` has no file-level skip, so every cell carries
// its own `{ skip }` — the shape the rest of this suite uses for a migration-gated file.
//
// Runs as ROOT rather than through a pool, and that is a statement about the estate rather than
// test convenience: `clara_runtime` has no USAGE on the `workflow` schema at all (measured), so
// the preflight's own production door opens a base-login connection to the WORLD's DSN. The rig's
// `rootQuery` is that same identity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import * as rig from "./rig.mjs";
// The wake/close_prep planters by IMPORT rather than retyped: they encode producer contracts
// (a wake task's firm and client are DERIVED from its originating client-scoped event, not supplied)
// that a hand-written INSERT here would get wrong, and their own `after` hook removes the sources
// it registered.
import { BANK_DUE_TYPE, registerSource, plantHeldWakeTask, plantQueuedClosePrepTask } from "./g1-wake-bodies.fixtures.mjs";
import {
  AGENT_TASK_KIND_CLASSES,
  AGENT_TASK_KINDS_FROM_SOURCES,
  DOCUMENT_LANE_CLASSES,
  DOCUMENT_LANES_WITHOUT_WORKFLOW,
  FRONTIER_BODY_RULES,
  LIVE_DOCUMENT_TASK_STATUSES,
  LIVE_TASK_STATUSES,
  TASK_STATUSES_WITHOUT_BODY,
  TERMINAL_RUN_STATUSES,
  bodyIdentifierOf,
  censusNonTerminalRuns,
  censusUnboundTasks,
  classOfBody,
  frontierBodyViolations,
  migrationOrdinal,
  preflight,
  readMigrationFrontier,
  refusalFooterLines,
  strandedBodyCensus,
  supportedBodiesFromBundle,
  taskIsStranded,
} from "../lib/rollback-preflight.mjs";

/** The literal members of a `check (col = any (array[...]))` constraint, read from the catalog.
 *  The point of reading them is that a future migration's new kind/lane/status reds this file
 *  instead of quietly falling outside a census that claims to be complete. */
async function checkDomain(relation, constraintName) {
  const r = await rig.rootQuery(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and conname = $2",
    [relation, constraintName],
  );
  const def = r.rows[0]?.def ?? "";
  return [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
}

/** Positive catalog probe — the relations these cells actually read. */
async function preflightReady() {
  try {
    const r = await rig.rootQuery(`
      select to_regclass('workflow.workflow_runs') is not null as runs_tbl,
             to_regclass('clara.accounting_work') is not null as work_tbl,
             to_regclass('clara.document_processing_tasks') is not null as doc_tbl,
             to_regclass('clara.wake_engine_sources') is not null as wake_tbl,
             to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit
    `);
    const row = r.rows[0] ?? {};
    return Boolean(row.runs_tbl && row.work_tbl && row.doc_tbl && row.wake_tbl && row.admit);
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await preflightReady());
const SKIP = READY ? false : "the WDK world (workflow.workflow_runs), migration 0178 or the document lane is absent from this database";

const query = (sql, params) => rig.rootQuery(sql, params);

/** Stage a non-terminal WDK run row directly. The engine is not running in this process, so the
 *  row is the fixture — and the preflight reads rows, not engines. */
async function stageRun(bodyIdentifier, { status = "running", stem = null } = {}) {
  const id = `wrun_test_${randomUUID().replace(/-/g, "")}`;
  const m = /^(.*?)_?[vV](\d+)$/.exec(bodyIdentifier);
  const moduleStem = stem ?? (m ? `${m[1]}.v${m[2]}` : bodyIdentifier);
  const name = `workflow//./workflows/${moduleStem}//${bodyIdentifier}`;
  await rig.rootQuery(
    "insert into workflow.workflow_runs (id, deployment_id, status, name) values ($1,$2,$3::workflow.status,$4)",
    [id, "preflight-test", status, name],
  );
  return { id, name };
}

const dropRuns = (ids) => rig.rootQuery("delete from workflow.workflow_runs where id = any($1::text[])", [ids]);

const basis = () => ({
  posting_date: "2026-09-07",
  memo: "office rent — preflight fixture",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 44400, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 44400, description: "Maybank" },
  ],
});

/** Admit real Work through the real door and leave it UNBOUND: no engine runs in this process, so
 *  the queued `accounting_work` task never acquires a `workflow_run_id`. */
async function admitUnboundWork(label) {
  const { owner, client } = await rig.buildFirm(label);
  const receipt = await rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client, owner, `preflight_${randomUUID()}`, JSON.stringify(basis()), "user_direct", JSON.stringify([]), rig.DEFAULT_MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);
  return receipt;
}

/** CANCELLED, never deleted: `clara.agent_tasks` refuses a DELETE (CLR08) and
 *  `clara.accounting_work` is immutable by trigger. Taking a fixture task terminal is the only
 *  honest way to stop it counting, and it is what an operator would do with a Work they dropped. */
const cancelTask = (id) => rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [id]);

/**
 * Retire a planted WAKE task by its INTENT, then PROVE nothing of it is left held.
 *
 * By intent rather than by id, and verified rather than assumed, because this file leaked one on
 * the rig while it was being written: a held wake task that outlives its cell is not tidy-up debt,
 * it is a row that makes the preflight's fail-closed arm refuse EVERY rollback on that database
 * until somebody settles it (its source is gone, so this module cannot place it — which is the
 * correct reading and exactly why the fixture must not create one and walk away).
 */
async function retireWakeTask(intentId) {
  await rig.rootQuery(
    "update clara.agent_tasks set status = 'cancelled' where origin_intent_id = $1 and status = 'held'",
    [intentId],
  );
  const left = await rig.rootQuery(
    "select id, status from clara.agent_tasks where origin_intent_id = $1 and status not in ('completed','failed','cancelled','expired')",
    [intentId],
  );
  assert.equal(left.rowCount, 0, `this cell left live wake task(s) behind: ${JSON.stringify(left.rows)}`);
}

/** Same rule in the document table: a DELETE is refused (CLR08). `failed` + `budget` +
 *  `finished_at` is the ONE terminal shape its own CHECK admits for a task that never started, and
 *  it is what the lane writes when it declines a kind. */
const retireDocumentTask = (id) =>
  rig.rootQuery(
    "update clara.document_processing_tasks set status = 'failed', error_code = 'budget', finished_at = now() where id = $1",
    [id],
  );

/**
 * #1015 — seed `n` UNRELATED, live `clara.document_processing_tasks` rows, each its OWN firm and
 * (cycled) lane, none of them a document the caller under test will ever name. This is the exact
 * noise the ticket reproduces: rows a task-id/work-id scope has no way to correspond to, because
 * `clara.document_processing_tasks` carries no `work_id`/`task_id` column at all — the two tables
 * share no key a scope could join on. Returns the planted ids for `retireNoiseDocumentTasks`.
 */
async function plantNoiseDocumentTasks(n) {
  const lanes = ["ocr", "invoice_facts", "statement_facts", "llm_witness", "structured_parse"];
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const { owner, firm } = await rig.buildFirm(`pf-1015-noise-${i}`);
    const sha = rig.sha(`pf-1015-noise-${i}-${randomUUID()}`);
    const document = (
      await rig.rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r", [
        firm, null, sha, `pf-1015-noise-${i}.pdf`, "application/pdf", 2048, `firms/${firm}/docs/${sha}.pdf`, owner,
      ])
    ).rows[0].r.document_id;
    const taskId = (
      await rig.rootQuery(
        `insert into clara.document_processing_tasks (firm_id, document_id, engine_id, version_n, lane, status)
         values ($1,$2,'clara-fixture:v1',1,$3,'queued') returning id`,
        [firm, document, lanes[i % lanes.length]],
      )
    ).rows[0].id;
    ids.push(taskId);
  }
  return ids;
}

const retireNoiseDocumentTasks = (ids) => Promise.all(ids.map((id) => retireDocumentTask(id)));

// ---------------------------------------------------------------------------
// Pure derivations — no database needed, and they are what everything else rests on.
// ---------------------------------------------------------------------------

test("637.pf: the body identifier and its CLASS are derived from the run ROW's own WDK name", () => {
  assert.equal(bodyIdentifierOf("workflow//./workflows/claraWork.v1//claraWork_v1"), "claraWork_v1");
  assert.equal(bodyIdentifierOf("workflow//./workflows/chatTurn.v18//chatTurn_v18"), "chatTurn_v18");
  assert.equal(bodyIdentifierOf("workflow//./workflows/closeExample.v1//closeExampleV1"), "closeExampleV1");
  // An unrecognised name is returned VERBATIM rather than nulled: it must stay comparable against
  // the supported set, and comparing it verbatim is exactly what makes it refuse.
  assert.equal(bodyIdentifierOf("something-else-entirely"), "something-else-entirely");
  assert.equal(bodyIdentifierOf(""), "");
  assert.equal(bodyIdentifierOf(null), "");
  assert.equal(classOfBody("claraWork_v2"), "claraWork");
  assert.equal(classOfBody("closeExampleV1"), "closeExample");
  assert.equal(classOfBody("notAVersionedThing"), "notAVersionedThing");
});

test("637.pf: N9 — the status vocabularies are EXPORTED constants, not literals repeated per query", () => {
  assert.deepEqual([...TERMINAL_RUN_STATUSES], ["completed", "failed", "cancelled"]);
  assert.deepEqual([...LIVE_TASK_STATUSES], ["queued", "held", "running", "awaiting_input"]);
  assert.deepEqual([...TASK_STATUSES_WITHOUT_BODY], ["cancel_requested", "completed", "failed", "cancelled", "expired"]);
  assert.deepEqual([...LIVE_DOCUMENT_TASK_STATUSES], ["queued", "held_egress"]);
  for (const frozen of [TERMINAL_RUN_STATUSES, LIVE_TASK_STATUSES, TASK_STATUSES_WITHOUT_BODY, LIVE_DOCUMENT_TASK_STATUSES]) {
    assert.equal(Object.isFrozen(frozen), true);
  }
});

test("637.pf: B3 — the kind/lane -> class maps cover every kind that has a workflow, and say so for the ones that do not", () => {
  // `clara.agent_tasks.kind` has five members. Three bind a STATIC class; the other two
  // (`wake`, `close_prep`) are DB-driven through clara.wake_engine_sources.workflow_export, so
  // they are deliberately ABSENT from the static map rather than guessed at.
  assert.deepEqual(Object.keys(AGENT_TASK_KIND_CLASSES).sort(), ["accounting_work", "autodraft", "chat_turn"]);
  assert.equal(AGENT_TASK_KIND_CLASSES.chat_turn, "chatTurn");
  assert.equal(AGENT_TASK_KIND_CLASSES.autodraft, "autoDraft");
  assert.equal(AGENT_TASK_KIND_CLASSES.accounting_work, "claraWork");
  // The document lanes mirror reconciler-documents.mjs's own enqueueForLane allowlist exactly.
  assert.equal(DOCUMENT_LANE_CLASSES.ocr, "documentIngest");
  assert.equal(DOCUMENT_LANE_CLASSES.structured_parse, "documentIngest");
  assert.equal(DOCUMENT_LANE_CLASSES.none, "documentIngest");
  assert.equal(DOCUMENT_LANE_CLASSES.invoice_facts, "invoiceFacts");
  assert.equal(DOCUMENT_LANE_CLASSES.statement_facts, "statementFacts");
  assert.equal(DOCUMENT_LANE_CLASSES.statement_parse, "statementFacts");
  assert.equal(DOCUMENT_LANE_CLASSES.llm_witness, "witnessFacts");
  // …and the two lanes that ride a consumer LOOP rather than a workflow are named, not omitted:
  // omitting them would make them look like unknown lanes and refuse every rollback forever.
  assert.equal(DOCUMENT_LANES_WITHOUT_WORKFLOW.has("classify"), true);
  assert.equal(DOCUMENT_LANES_WITHOUT_WORKFLOW.has("local_facts"), true);
});

test("637.pf: B3 — every kind in clara.agent_tasks's OWN check constraint is covered, derived from the catalog", { skip: SKIP }, async () => {
  // The review's blocker was that the unbound leg censused ONE of the five kinds. The fix is not
  // "three literals instead of one" — it is that the coverage claim is CHECKED against the schema:
  // a migration that adds a sixth kind reds this cell rather than silently falling outside a
  // census that advertises itself as complete.
  const kinds = await checkDomain("clara.agent_tasks", "ck_agent_tasks_kind_0011");
  assert.deepEqual(kinds, ["accounting_work", "autodraft", "chat_turn", "close_prep", "wake"], "the kind domain this cell was written against");
  const covered = [...Object.keys(AGENT_TASK_KIND_CLASSES), ...AGENT_TASK_KINDS_FROM_SOURCES].sort();
  assert.deepEqual(covered, kinds, "every kind is either statically classed or read from clara.wake_engine_sources — none is uncovered");
  // …and the two halves do not overlap: a kind with BOTH a literal and a DB source would make the
  // census's answer depend on which one it consulted.
  for (const kind of AGENT_TASK_KINDS_FROM_SOURCES) {
    assert.equal(AGENT_TASK_KIND_CLASSES[kind], undefined, `${kind}'s class is a DATABASE fact and must not also be a literal`);
  }
});

test("637.pf: B1 — the live/no-body STATUS partition is complete against the catalog (a wake task is born 'held')", { skip: SKIP }, async () => {
  const statuses = await checkDomain("clara.agent_tasks", "agent_tasks_status_check");
  const partition = [...LIVE_TASK_STATUSES, ...TASK_STATUSES_WITHOUT_BODY].sort();
  assert.deepEqual(partition, statuses, "every agent-task status is classified as live-needs-a-body or not — none is unclassified");
  assert.equal(
    LIVE_TASK_STATUSES.includes("held"),
    true,
    "'held' is LIVE: a wake task is created held (0011:1230) and only becomes running when the engine claims it, "
      + "so a queued/running/awaiting_input census cannot see a wake task waiting for its source",
  );
  assert.equal(
    LIVE_TASK_STATUSES.includes("cancel_requested"),
    false,
    "…and cancel_requested is NOT: reconciler.mjs section B settles an unbound one terminal without starting any body",
  );
  const docStatuses = await checkDomain("clara.document_processing_tasks", "document_processing_tasks_status_check");
  assert.deepEqual(docStatuses, ["done", "failed", "held_egress", "queued", "running"].sort(), "the document status domain this cell was written against");
  // The document half is derivable rather than asserted: the binding CHECK names, in its own text,
  // exactly which statuses pair with `workflow_run_id IS NULL` before a run exists.
  const binding = (
    await rig.rootQuery(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'clara.document_processing_tasks'::regclass and conname = 'ck_processing_task_binding_f_a1'",
    )
  ).rows[0].def;
  const unboundArm = /status = ANY \(ARRAY\[([^\]]+)\]\)\) AND \(workflow_run_id IS NULL\)/.exec(binding);
  assert.ok(unboundArm, `the binding CHECK still carries an unbound arm; got ${binding}`);
  const unboundStatuses = [...unboundArm[1].matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  assert.deepEqual([...LIVE_DOCUMENT_TASK_STATUSES].sort(), unboundStatuses, "the document live list IS the constraint's own unbound arm");
});

test("637.pf: B3 — every document LANE in the catalog's own check constraint is covered", { skip: SKIP }, async () => {
  const lanes = await checkDomain("clara.document_processing_tasks", "ck_processing_task_lane_f_a1");
  const covered = [...Object.keys(DOCUMENT_LANE_CLASSES), ...DOCUMENT_LANES_WITHOUT_WORKFLOW].sort();
  assert.deepEqual(covered, lanes, "every lane is either mapped to a class or explicitly named as needing no workflow");
});

test("637.pf: supportedBodiesFromBundle reads BODY directives and rejects STEP directives", () => {
  const bundle = [
    'const a = "workflows/claraWork.v1//claraWork_v1";',
    'const b = "workflows/claraWork.v2//claraWork_v2";',
    'const c = "workflows/closeExample.v1//closeExampleV1";',
    // A step directive shares the shape but its module stem is not the one its export implies.
    'const d = "workflows/chatTurn.v18.impl//runModelSegmentStepV18";',
    'const e = "workflows/claraWork.v2.impl//claimWorkRunStepV2";',
  ].join("\n");
  assert.deepEqual(supportedBodiesFromBundle(bundle), ["claraWork_v1", "claraWork_v2", "closeExampleV1"]);
  assert.deepEqual(supportedBodiesFromBundle(""), []);
  assert.deepEqual(supportedBodiesFromBundle(null), []);
});

// ---------------------------------------------------------------------------
// The censuses and the verdict, on the rig.
// ---------------------------------------------------------------------------

test("637.pf: a non-terminal run on a body the TARGET image lacks REFUSES, and the refusal names it", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2");
  try {
    const out = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [staged.id] } });
    assert.equal(out.scoped.verdict, "refused");
    assert.ok(out.scoped.reasons.includes("unsupported_body"), `reasons name the unsupported body; got ${JSON.stringify(out.scoped.reasons)}`);
    assert.equal(out.scoped.outside.length, 1);
    assert.equal(out.scoped.outside[0].body, "claraWork_v2", "the refusal NAMES the body, derived from the row");
    assert.equal(out.scoped.outside[0].name, staged.name, "…and carries the full run name an operator can grep for");
    assert.equal(out.scoped.outside[0].count, 1);

    // The SAME staged run against a supported set that DOES carry v2 is allowed — so the refusal
    // above is about the supported set, not about the row merely existing.
    const ok = await preflight({ query, supported: ["claraWork_v1", "claraWork_v2"], scope: { runIds: [staged.id] } });
    assert.equal(ok.scoped.verdict, "allowed");
    assert.deepEqual(ok.scoped.outside, []);
  } finally {
    await dropRuns([staged.id]);
  }
});

test("637.pf: a TERMINAL run on an unsupported body does not refuse — the census is of live state", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2", { status: "completed" });
  try {
    const out = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [staged.id] } });
    assert.equal(out.scoped.verdict, "allowed");
    assert.deepEqual(out.scoped.runs, [], "a completed run is not in flight and is not inventoried");
  } finally {
    await dropRuns([staged.id]);
  }
});

test("637.pf: B1 — a RUN-shaped scope still measures the unbound-task leg IN FULL; never a false zero", { skip: SKIP }, async () => {
  const receipt = await admitUnboundWork("pf-b1");
  const staged = await stageRun("claraWork_v1");
  try {
    // A name scope and a run-id scope are both RUN-shaped. Before this fix each of them switched
    // the unbound census OFF and the CLI then printed "live tasks bound to NO run: 0" — a number
    // it had never looked for.
    for (const scope of [{ nameLike: "claraWork" }, { runIds: [staged.id] }]) {
      const out = await preflight({ query, supported: ["claraWork_v1"], scope });
      assert.equal(out.unbound.measured, true, `the GLOBAL unbound leg is measured under ${JSON.stringify(scope)}`);
      assert.ok(out.unbound.count >= 1, "…and it found the admitted Work");
      assert.equal(out.scoped.unbound.measured, true, "…and the SCOPED view reports measured, never an unlooked-for zero");
      assert.ok(
        out.unbound.tasks.some((t) => t.id === receipt.task_id),
        "the global unbound leg names the task regardless of a run-shaped scope",
      );
    }
  } finally {
    await cancelTask(receipt.task_id);
    await dropRuns([staged.id]);
  }
});

test("637.pf: B2 — a name scope may NOT allow while an out-of-scope body is stranded; the global verdict is the authority", { skip: SKIP }, async () => {
  const mine = await stageRun("claraWork_v1");
  const foreign = await stageRun("chatTurn_v18");
  try {
    // The exact hazard: a target that predates chatTurn_v18, narrowed to the claraWork lane.
    const out = await preflight({ query, supported: ["claraWork_v1", "chatTurn_v17"], scope: { nameLike: "claraWork" } });
    assert.equal(out.scoped.verdict, "allowed", "the SCOPED question — is my lane clear — is honestly yes");
    assert.equal(out.verdict, "refused", "…and the GLOBAL verdict, which the exit code follows, is NO");
    assert.ok(
      out.outside.some((row) => row.body === "chatTurn_v18"),
      `the global census names the out-of-scope stranded body; got ${JSON.stringify(out.outside)}`,
    );
    assert.equal(out.scope.given, true, "the result says it was narrowed");
    assert.notEqual(out.scoped.verdict, out.verdict, "the two verdicts are reported SEPARATELY — a scoped yes never widens into a global one");
  } finally {
    await dropRuns([mine.id, foreign.id]);
  }
});

test("637.pf: an UNBOUND accounting_work task refuses on its own, with zero workflow runs in scope", { skip: SKIP }, async () => {
  const receipt = await admitUnboundWork("pf-unbound");
  try {
    const task = await rig.rootQuery("select id, kind, status, workflow_run_id from clara.agent_tasks where id = $1", [receipt.task_id]);
    assert.equal(task.rows[0].kind, "accounting_work");
    assert.equal(task.rows[0].workflow_run_id, null, "admission binds no run — the run only exists once a worker claims it");

    // A target image that carries NO claraWork body at all: this is the pre-#623 rollback.
    const refused = await preflight({ query, supported: ["chatTurn_v18"], scope: { workIds: [receipt.work_id] } });
    assert.equal(refused.scoped.verdict, "refused");
    assert.ok(
      refused.scoped.reasons.includes("unbound_task"),
      `the reason is its own, not folded into unsupported_body; got ${JSON.stringify(refused.scoped.reasons)}`,
    );
    assert.deepEqual(refused.scoped.outside, [], "no workflow RUN is unsupported — this refusal comes from the task census alone");
    assert.equal(refused.scoped.unbound.count, 1);
    assert.equal(refused.scoped.unbound.tasks[0].id, receipt.task_id);
    assert.equal(refused.scoped.unbound.tasks[0].workflowClass, "claraWork", "the class the kind binds is named");

    // A target image that carries ANY claraWork body can run it: an unbound task has not chosen a
    // version yet, so what it needs is that the CLASS exists there at all.
    const allowed = await preflight({ query, supported: ["claraWork_v1"], scope: { workIds: [receipt.work_id] } });
    assert.equal(allowed.scoped.verdict, "allowed");
    assert.equal(allowed.scoped.unbound.count, 1, "…the task is still COUNTED; it simply does not strand");
    assert.deepEqual(allowed.scoped.unbound.strandedClasses, []);
  } finally {
    await cancelTask(receipt.task_id);
  }
});

test("637.pf: B3 — a queued CHAT_TURN task with no run strands a target without chatTurn", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("pf-chat");
  const session = await rig.createChatSession({ author: owner, client });
  const receipt = await rig.beginChatTurn({ session, author: owner, turnKey: `pf-chat-${randomUUID()}`, parts: [{ type: "text", text: "hello" }] });
  try {
    const row = await rig.rootQuery("select kind, status, workflow_run_id from clara.agent_tasks where id = $1", [receipt.task_id]);
    assert.equal(row.rows[0].kind, "chat_turn");
    assert.equal(row.rows[0].workflow_run_id, null, "an admitted turn is queued before any run exists — the same shape accounting_work has");

    const refused = await preflight({ query, supported: ["claraWork_v2"], scope: { taskIds: [receipt.task_id] } });
    assert.equal(refused.scoped.verdict, "refused", "a target with no chatTurn body cannot run a queued turn");
    assert.ok(refused.scoped.reasons.includes("unbound_task"));
    assert.ok(refused.scoped.unbound.strandedClasses.includes("chatTurn"), `the stranded CLASS is named; got ${JSON.stringify(refused.scoped.unbound.strandedClasses)}`);

    const allowed = await preflight({ query, supported: ["chatTurn_v7"], scope: { taskIds: [receipt.task_id] } });
    assert.equal(allowed.scoped.verdict, "allowed", "ANY chatTurn body satisfies a queued turn — it has not chosen a version yet");
  } finally {
    await cancelTask(receipt.task_id);
  }
});

test("637.pf: B3 — a queued DOCUMENT task with no run strands a target without that lane's class", { skip: SKIP }, async () => {
  const { owner, firm } = await rig.buildFirm("pf-doc");
  const sha = rig.sha(`pf-doc-${randomUUID()}`);
  const document = (
    await rig.rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r", [
      firm, null, sha, "pf-doc.pdf", "application/pdf", 2048, `firms/${firm}/docs/${sha}.pdf`, owner,
    ])
  ).rows[0].r.document_id;
  const taskId = (
    await rig.rootQuery(
      `insert into clara.document_processing_tasks (firm_id, document_id, engine_id, version_n, lane, status)
       values ($1,$2,'clara-fixture:v1',1,'ocr','queued') returning id`,
      [firm, document],
    )
  ).rows[0].id;
  try {
    const refused = await preflight({ query, supported: ["claraWork_v2", "chatTurn_v18"], scope: { documentTaskIds: [taskId] } });
    assert.equal(refused.scoped.verdict, "refused", "a target without documentIngest cannot run a queued OCR task");
    assert.ok(refused.scoped.unbound.strandedClasses.includes("documentIngest"));
    assert.equal(refused.scoped.unbound.tasks[0].table, "clara.document_processing_tasks", "the census says WHICH table the row is in");
    assert.equal(refused.scoped.unbound.tasks[0].lane, "ocr");

    const allowed = await preflight({ query, supported: ["documentIngest_v1"], scope: { documentTaskIds: [taskId] } });
    assert.equal(allowed.scoped.verdict, "allowed", "an image carrying ANY documentIngest body can run it");
  } finally {
    await retireDocumentTask(taskId);
  }
});

test("637.pf: B3 — a document lane that rides a CONSUMER LOOP (classify) never strands a rollback", { skip: SKIP }, async () => {
  const { owner, firm } = await rig.buildFirm("pf-classify");
  const sha = rig.sha(`pf-classify-${randomUUID()}`);
  const document = (
    await rig.rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r", [
      firm, null, sha, "pf-classify.pdf", "application/pdf", 2048, `firms/${firm}/docs/${sha}.pdf`, owner,
    ])
  ).rows[0].r.document_id;
  const taskId = (
    await rig.rootQuery(
      `insert into clara.document_processing_tasks (firm_id, document_id, engine_id, version_n, lane, status)
       values ($1,$2,'clara-classify-fixture:v1',1,'classify','queued') returning id`,
      [firm, document],
    )
  ).rows[0].id;
  try {
    const out = await preflight({ query, supported: [], scope: { documentTaskIds: [taskId] } });
    assert.equal(out.scoped.verdict, "allowed", "the classify lane is owned by its own consumer loop — NO workflow body can strand it");
    assert.equal(out.scoped.unbound.count, 1, "…it is still counted and reported");
    assert.equal(out.scoped.unbound.tasks[0].workflowClass, null);
    assert.equal(out.scoped.unbound.tasks[0].needsWorkflow, false, "…and explicitly marked as needing none, which is not the same as unknown");
  } finally {
    await retireDocumentTask(taskId);
  }
});

test("637.pf: B3 — a HELD wake task's class is READ from clara.wake_engine_sources, and is fail-closed until one is registered", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("pf-wake");
  const { taskId, intentId } = await plantHeldWakeTask({ owner, client, payload: { bank_account_id: randomUUID() } });
  try {
    const row = await rig.rootQuery("select kind, status, workflow_run_id from clara.agent_tasks where id = $1", [taskId]);
    assert.equal(row.rows[0].kind, "wake");
    assert.equal(row.rows[0].status, "held", "a wake task is BORN held — the status a queued/running census cannot see");
    assert.equal(row.rows[0].workflow_run_id, null);

    // FAIL-CLOSED FIRST: with no source registered for this task's event type, this module cannot
    // say which class the re-enqueue would dispatch to, so it refuses even a target carrying
    // everything. "I could not identify it" is never "it is fine".
    const blind = await preflight({ query, supported: ["bankAgent_v1", "claraWork_v2"], scope: { taskIds: [taskId] } });
    assert.equal(blind.scoped.verdict, "refused", "an unplaceable kind fails CLOSED");
    assert.equal(blind.scoped.unbound.tasks[0].known, false, "…and says so: the class could not be identified");
    assert.equal(blind.scoped.unbound.tasks[0].workflowClass, null);

    // Now the source exists. The class is a DATABASE fact — `workflowsByName[workflow_export]` is
    // how lib/wake-engine.mjs dispatches it — so the census READS it rather than guessing a literal.
    await registerSource({
      sourceKey: `g1_test_pf_${randomUUID().slice(0, 8)}`, carrier: "wake_outbox", eventType: BANK_DUE_TYPE,
      taskKind: "wake", wakeKind: "bank_agent", workflowExport: "bankAgent", loginPool: "bank", enabled: true, actor: owner,
    });
    const refused = await preflight({ query, supported: ["claraWork_v2"], scope: { taskIds: [taskId] } });
    assert.equal(refused.scoped.verdict, "refused", "a target with no bankAgent body cannot run a held wake task");
    assert.equal(refused.scoped.unbound.tasks[0].known, true);
    assert.deepEqual(refused.scoped.unbound.strandedClasses, ["bankAgent"], "the class comes from wake_engine_sources.workflow_export");

    const allowed = await preflight({ query, supported: ["bankAgent_v1"], scope: { taskIds: [taskId] } });
    assert.equal(allowed.scoped.verdict, "allowed", "an image carrying the class can run it");
  } finally {
    await retireWakeTask(intentId);
  }
});

test("637.pf: B3 — two sources sharing one task_kind count the task ONCE, and the ENABLED one decides its class", { skip: SKIP }, async () => {
  // `wake_engine_sources.source_key` is the primary key; nothing makes `task_kind` unique
  // (lib/wake-engine.mjs:155-157 says so). A plain `left join ... on s.task_kind = t.kind`
  // therefore MULTIPLIES the task row by its registered sources and picks an arbitrary class —
  // the ambiguity reconciler-wake.mjs's own resolveSource already settled with an ORDER BY. This
  // cell is the reproduction: one disabled predecessor, one enabled replacement, one task.
  //
  // #1015 — THIS is the exact cell wave-1/wave-2 integration gates caught failing on a database
  // carrying leftover queued `document_processing_tasks` rows (19, then 18, unrelated, from
  // earlier e2e work): `censusUnboundTasks(query, { taskIds: [taskId] })` returned 20/19 rows
  // instead of 1, because the document lane ran unscoped. Seeding the SAME shape of noise here,
  // deterministically, makes this cell prove the fix rather than merely happen not to trip it.
  const { firm, client, owner } = await rig.buildFirm("pf-fanout");
  const taskId = await plantQueuedClosePrepTask({ firm, client });
  const noise = await plantNoiseDocumentTasks(4);
  try {
    await registerSource({
      sourceKey: `g1_test_pf_old_${randomUUID().slice(0, 8)}`, carrier: "direct_queue", taskKind: "close_prep",
      wakeKind: "close_prep", workflowExport: "closePrepGhost", enabled: false, actor: owner,
    });
    await registerSource({
      sourceKey: `g1_test_pf_new_${randomUUID().slice(0, 8)}`, carrier: "direct_queue", taskKind: "close_prep",
      wakeKind: "close_prep", workflowExport: "closePrep", enabled: true, actor: owner,
    });
    const out = await censusUnboundTasks(query, { taskIds: [taskId] });
    assert.equal(
      out.tasks.length, 1,
      `ONE row for ONE task, whatever the source count, even with ${noise.length} unrelated document-processing tasks live; got ${JSON.stringify(out.tasks)}`,
    );
    assert.equal(out.tasks[0].kind, "close_prep");
    assert.equal(out.tasks[0].workflowClass, "closePrep", "the ENABLED source answers — reconciler-wake.mjs's own ordering, verbatim");

    const refused = await preflight({ query, supported: ["claraWork_v2"], scope: { taskIds: [taskId] } });
    assert.equal(refused.scoped.verdict, "refused");
    assert.deepEqual(refused.scoped.unbound.strandedClasses, ["closePrep"]);
    const allowed = await preflight({ query, supported: ["closePrep_v1"], scope: { taskIds: [taskId] } });
    assert.equal(allowed.scoped.verdict, "allowed");
  } finally {
    await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [taskId]);
    await retireNoiseDocumentTasks(noise);
  }
});

test("637.pf: #1015 — a census scoped by task ids ignores unrelated document-processing tasks in other lanes and firms", { skip: SKIP }, async () => {
  // THE DEFECT, reproduced deterministically. `clara.document_processing_tasks` carries no
  // work_id/task_id column at all, so a caller scoping the agent-task half by `taskIds` has no
  // correspondence the document half could filter by. Before the fix, an absent `documentTaskIds`
  // meant "no filter" for that half — so it returned EVERY live row in the table, from ANY firm,
  // ANY lane, whatever the caller actually scoped by.
  const receipt = await admitUnboundWork("pf-1015-scope");
  const noise = await plantNoiseDocumentTasks(3);
  try {
    const out = await censusUnboundTasks(query, { taskIds: [receipt.task_id] });
    assert.equal(
      out.tasks.length, 1,
      `a task-id scope must not pull in unrelated document-processing tasks; got ${JSON.stringify(out.tasks)}`,
    );
    assert.equal(out.tasks[0].table, "clara.agent_tasks");
    assert.equal(out.tasks[0].id, receipt.task_id, "the ONE row is the caller's own scoped task, not a noise row");
    assert.equal(out.measured, true, "…and it still says it LOOKED — B1's lesson holds for the narrowed half too");

    // The same shape for a WORK-shaped scope: `accounting_work`'s task is reached by work id, and
    // the document half is exactly as unrelated to a work id as it is to a task id.
    const byWork = await censusUnboundTasks(query, { workIds: [receipt.work_id] });
    assert.equal(byWork.tasks.length, 1, `a work-id scope must not pull in unrelated document-processing tasks; got ${JSON.stringify(byWork.tasks)}`);
    assert.equal(byWork.tasks[0].id, receipt.task_id);
  } finally {
    await cancelTask(receipt.task_id);
    await retireNoiseDocumentTasks(noise);
  }
});

test("637.pf: #1015 — an explicit ask for the FULL document picture (documentTaskIds: null) is honoured even alongside a task-id scope", { skip: SKIP }, async () => {
  // THE OTHER HALF OF THE CONTRACT. "No document scope requested" (the key absent, the cell above)
  // and "explicitly requesting the unscoped full census" (the key present, even as `null`) must be
  // DISTINGUISHABLE and must behave differently — the Agent Brief's own words. A caller that wants
  // the whole document-processing picture alongside an unrelated task-id scope can still ask for it,
  // by naming the key at all.
  //
  // ASSERTED AS A DIFFERENCE BETWEEN TWO CALLS, NEVER AS A TOTAL (review SPEC-1015-01). An earlier
  // shape of this cell pinned `tasks.length` to the number of rows it had just planted — a claim
  // about the size of the WHOLE live document census, true only on a database carrying nothing
  // else. That is the very contamination-dependence #1015 exists to remove, and it reds (18 !== 2)
  // on this lane's own database and on any CI database where an earlier file left a queued
  // document row behind. What the contract actually says is a DIFFERENCE between two calls that
  // differ ONLY in whether the key is named, and that difference holds whatever else is live.
  const noise = await plantNoiseDocumentTasks(2);
  const scopedToNothing = { taskIds: [randomUUID()] };
  try {
    const asked = await censusUnboundTasks(query, { ...scopedToNothing, documentTaskIds: null });
    for (const id of noise) {
      assert.ok(asked.tasks.some((t) => t.id === id), `noise row ${id} must be present when the document scope was explicitly asked for in full`);
    }
    assert.ok(
      asked.tasks.every((t) => t.table === "clara.document_processing_tasks"),
      `naming documentTaskIds widens the DOCUMENT half only — the agent half stays scoped by taskIds; got ${JSON.stringify(asked.tasks)}`,
    );

    // THE SAME CALL WITH THE KEY LEFT OUT — the one difference under test. An agent-shaped scope
    // naming nothing this cell owns comes back with NO document row at all: not the two just
    // planted, and not anyone else's either.
    const unasked = await censusUnboundTasks(query, scopedToNothing);
    assert.deepEqual(
      unasked.tasks, [],
      `an ABSENT documentTaskIds key narrows the document half to none, whatever is live; got ${JSON.stringify(unasked.tasks)}`,
    );
    assert.equal(unasked.measured, true, "…and it still says it LOOKED — B1's lesson holds for the narrowed half too");

    // …and a fully OPEN call (no scope at all) is the same ask, made the other way — the shape
    // preflight()'s own GLOBAL census already relies on, unaffected by this fix.
    const open = await censusUnboundTasks(query, {});
    assert.ok(noise.every((id) => open.tasks.some((t) => t.id === id)), "an unscoped call still sees the full document picture");
  } finally {
    await retireNoiseDocumentTasks(noise);
  }
});

test("637.pf: the stranding predicate is ONE exported rule — the CLI's refusal listing cannot drift from the verdict", () => {
  assert.equal(taskIsStranded(["claraWork_v1"], { needsWorkflow: true, known: true, workflowClass: "claraWork" }), false);
  assert.equal(taskIsStranded(["claraWork_v1"], { needsWorkflow: true, known: true, workflowClass: "chatTurn" }), true);
  assert.equal(taskIsStranded([], { needsWorkflow: false, known: true, workflowClass: null }), false, "a consumer-loop lane never strands");
  assert.equal(
    taskIsStranded(["claraWork_v1", "chatTurn_v18", "closePrep_v1"], { needsWorkflow: true, known: false, workflowClass: null }),
    true,
    "FAIL-CLOSED: an unidentifiable kind strands even against a target carrying everything",
  );
});

test("637.pf: SHOULD-3 — the refusal footer names a THIRD way forward when a stranded task is UNPLACEABLE", () => {
  const supported = ["claraWork_v1"];
  const placeable = { table: "clara.agent_tasks", id: "t1", kind: "chat_turn", lane: null, status: "queued", workflowClass: "chatTurn", needsWorkflow: true, known: true };
  const unplaceable = { table: "clara.agent_tasks", id: "t2", kind: "wake", lane: null, status: "held", workflowClass: null, needsWorkflow: true, known: false };

  // Every stranding row NAMES a class (claraWork_v1 is missing chatTurn) -> the ORIGINAL two-way footer, unchanged.
  const twoWay = refusalFooterLines(supported, { unbound: { tasks: [placeable] } });
  assert.equal(twoWay.length, 1);
  assert.match(twoWay[0], /two admissible ways forward/);
  assert.match(twoWay[0], /RETAIN every non-terminal bundle/);
  assert.doesNotMatch(twoWay[0], /wake_engine_sources/, "the two-way footer never mentions the third way");

  // A held wake task with no source row (known:false) is UNPLACEABLE for BOTH named ways -> the third way.
  const threeWay = refusalFooterLines(supported, { unbound: { tasks: [placeable, unplaceable] } });
  assert.equal(threeWay.length, 1);
  assert.match(threeWay[0], /UNPLACEABLE/);
  assert.match(threeWay[0], /clara\.agent_tasks t2/, "names the unplaceable row");
  assert.match(threeWay[0], /wake_engine_sources/, "the concrete repair: register\\/repair the wake source row");
  assert.match(threeWay[0], /retire the task/);
  assert.doesNotMatch(threeWay[0], /clara\.agent_tasks t1/, "the placeable row is not named as unplaceable");

  // A target that carries EVERY named class still owes the third way to the one row it cannot even identify.
  const stillThreeWay = refusalFooterLines(["claraWork_v1", "chatTurn_v18", "closePrep_v1"], { unbound: { tasks: [unplaceable] } });
  assert.match(stillThreeWay[0], /UNPLACEABLE/, "an unplaceable row strands the footer even against a target carrying everything named");
});

test("637.pf: N8 — a WORK-shaped scope narrows the RUN census too, with foreign parked runs present", { skip: SKIP }, async () => {
  const receipt = await admitUnboundWork("pf-n8");
  const foreign = [];
  for (let i = 0; i < 3; i += 1) foreign.push(await stageRun("chatTurn_v18"));
  // Bind a run to this Work's task so the scope has something to derive.
  const mineRun = await stageRun("claraWork_v1");
  await rig.rootQuery("update clara.agent_tasks set workflow_run_id = $2, status = 'running' where id = $1", [receipt.task_id, mineRun.id]);
  try {
    const out = await preflight({ query, supported: ["claraWork_v1", "chatTurn_v17"], scope: { workIds: [receipt.work_id] } });
    assert.equal(out.scoped.runs.length, 1, "the scoped run census is exactly this Work's own run, derived from the task");
    assert.equal(out.scoped.runs[0].body, "claraWork_v1");
    assert.equal(out.scoped.verdict, "allowed", "…so the three foreign parked runs do not decide the scoped verdict");
    assert.equal(out.verdict, "refused", "…while the GLOBAL verdict still refuses, naming them");
    assert.ok(out.outside.some((r) => r.body === "chatTurn_v18"));
    assert.deepEqual(out.scope.derivedRunIds, [mineRun.id], "the derivation is reported, so a reader can check WHICH runs were considered");
  } finally {
    await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [receipt.task_id]);
    await dropRuns([mineRun.id, ...foreign.map((r) => r.id)]);
  }
});

test("637.pf: #708 — an explicit scope answers about THIS caller's runs, with 20 unrelated parked runs present", { skip: SKIP }, async () => {
  const noise = [];
  for (let i = 0; i < 20; i += 1) noise.push(await stageRun("chatTurn_v18"));
  const mine = await stageRun("claraWork_v1");
  try {
    const out = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [mine.id] } });
    assert.equal(out.scoped.verdict, "allowed", "#708: scoped to the run this caller staged, the verdict depends solely on it");
    assert.equal(out.scoped.runs.length, 1);
    assert.equal(out.scoped.runs[0].body, "claraWork_v1");
    assert.equal(out.verdict, "refused", "…and the global census still sees the noise, which is what the exit code follows");
    assert.ok(out.outside.some((row) => row.body === "chatTurn_v18"));
    // A NAME filter is the other admissible scope and reaches the same answer from the other side.
    const byName = await preflight({ query, supported: ["chatTurn_v18"], scope: { nameLike: "chatTurn.v18" } });
    assert.equal(byName.scoped.verdict, "allowed");
    assert.equal(byName.scoped.runs.reduce((n, row) => n + row.count, 0), 20);
  } finally {
    await dropRuns([mine.id, ...noise.map((r) => r.id)]);
  }
});

test("637.pf: the raw censuses are separately readable — an operator can see the inventory, not only the verdict", { skip: SKIP }, async () => {
  const a = await stageRun("claraWork_v1");
  const b = await stageRun("claraWork_v1");
  try {
    const runs = await censusNonTerminalRuns(query, { runIds: [a.id, b.id] });
    assert.equal(runs.length, 1, "grouped by name");
    assert.equal(runs[0].count, 2);
    assert.equal(runs[0].body, "claraWork_v1");
    assert.ok(runs[0].oldest, "the inventory carries an age — 'how long has this been parked' is the operator's next question");

    const unbound = await censusUnboundTasks(query, { taskIds: [randomUUID()], documentTaskIds: [randomUUID()] });
    assert.deepEqual(unbound.tasks, [], "a scope that names nothing real returns nothing, never everything");
    assert.equal(unbound.measured, true, "…and it says it LOOKED, which is the whole point of B1");
  } finally {
    await dropRuns([a.id, b.id]);
  }
});

test("637.pf: the BOOT census names the bodies live runs are parked on that THIS image does not carry", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2");
  try {
    const without = await strandedBodyCensus({ query, carried: ["claraWork_v1", "chatTurn_v18"] });
    assert.equal(without.measured, true);
    assert.ok(without.names.includes("claraWork_v2"), "the stranded body is named");
    assert.ok(without.stranded >= 1);

    const with2 = await strandedBodyCensus({ query, carried: ["claraWork_v1", "claraWork_v2", "chatTurn_v18"] });
    assert.equal(with2.names.includes("claraWork_v2"), false, "an image that carries the body strands nothing of it");
  } finally {
    await dropRuns([staged.id]);
  }
});

// ---------------------------------------------------------------------------
// THE FRONTIER RULE (wave-3, #815) — the leg neither census can see.
//
// 0195 grandfathers a run claimed under a pre-v3 bundle past its egress wall (the orchestrator's
// ruling, verbatim in the migration header and docs/ARCHITECTURE.md §10), so a FORWARD cutover
// finishes parked v1/v2 runs honestly. The price is the other direction: an image without
// `claraWork_v3` would run the ENTIRE Work lane through that grandfather arm on a database whose
// schema says the wall is in force — with the lane fully drained, so both censuses are clean and
// every other leg says ALLOWED. These cells are the refusal, and they are pure: the rule is a
// function of a version string and a body roster.
// ---------------------------------------------------------------------------

/** A `query` that answers ONLY the two censuses, both empty. No rig: these cells are about the
 *  frontier rule and nothing else, and a stub makes that visible rather than incidental. */
const emptyCensusQuery = async () => ({ rows: [] });

test("637.pf: the frontier rule is a TABLE, and 0195 -> claraWork_v3 is its first row", () => {
  assert.equal(Object.isFrozen(FRONTIER_BODY_RULES), true);
  const r = FRONTIER_BODY_RULES.find((x) => x.migration.startsWith("0195_"));
  assert.ok(r, `0195 must be in the rule table; got ${JSON.stringify(FRONTIER_BODY_RULES.map((x) => x.migration))}`);
  assert.deepEqual([...r.requires], ["claraWork_v3"]);
  assert.ok(r.why && r.why.length > 0, "a rule states WHY, so a later reader can judge whether it still holds");
  // Every row is ordinal-comparable, which is the whole mechanism: a rule whose migration name has
  // no leading ordinal could never come into force.
  for (const rule of FRONTIER_BODY_RULES) {
    assert.equal(typeof migrationOrdinal(rule.migration), "number", `${rule.migration} has no 4-digit ordinal`);
  }
  assert.equal(migrationOrdinal("0194_periodic_adjustments"), 194);
  assert.equal(migrationOrdinal("0195_work_egress_purpose_and_execution_trace"), 195);
  assert.equal(migrationOrdinal("not-a-migration"), null);
});

test("637.pf: BELOW the frontier the rule is not in force — 0194 + a target without claraWork_v3 ALLOWS", async () => {
  assert.deepEqual(frontierBodyViolations("0194_periodic_adjustments", ["claraWork_v2", "chatTurn_v18"]), []);
  const out = await preflight({
    query: emptyCensusQuery,
    supported: ["claraWork_v1", "claraWork_v2", "chatTurn_v18"],
    frontier: "0194_periodic_adjustments",
  });
  assert.equal(out.verdict, "allowed", "a database that has not applied 0195 does not carry 0195's rule");
  assert.deepEqual(out.reasons, []);
  assert.deepEqual(out.frontier.violations, []);
  assert.equal(out.frontier.version, "0194_periodic_adjustments");
  assert.equal(out.frontier.measured, true, "…and it SAYS it looked — a rule nobody measured is not a pass");
  // A database with nothing applied at all is the same answer for the same reason.
  assert.deepEqual(frontierBodyViolations(null, []), []);
});

test("637.pf: AT the frontier a target without claraWork_v3 is REFUSED, naming 0195 AND the body", async () => {
  const out = await preflight({
    query: emptyCensusQuery,
    supported: ["claraWork_v1", "claraWork_v2", "chatTurn_v18"],
    frontier: "0195_work_egress_purpose_and_execution_trace",
  });
  assert.equal(out.verdict, "refused", "with 0195 applied, an image that cannot satisfy its wall is not shippable");
  assert.deepEqual(out.reasons, ["frontier_requires_body"],
    "…and the reason is ITS OWN: nothing is in flight, so neither census contributed");
  assert.deepEqual(out.runs, [], "the run census is clean — this refusal is not drainable");
  assert.equal(out.unbound.strandedCount, 0);
  assert.equal(out.frontier.violations.length, 1);
  assert.equal(out.frontier.violations[0].migration, "0195_work_egress_purpose_and_execution_trace",
    "the refusal NAMES the migration whose rule is in force");
  assert.equal(out.frontier.violations[0].body, "claraWork_v3", "…and the body the target is missing");
  // A LATER frontier keeps the rule in force: `>= 0195`, not `== 0195`.
  assert.equal(frontierBodyViolations("0231_something_later", ["claraWork_v2"]).length, 1);
});

test("637.pf: AT the frontier a target WITH claraWork_v3 allows — the rule is about the roster, not the number", async () => {
  const out = await preflight({
    query: emptyCensusQuery,
    supported: ["claraWork_v1", "claraWork_v2", "claraWork_v3", "chatTurn_v18"],
    frontier: "0195_work_egress_purpose_and_execution_trace",
  });
  assert.equal(out.verdict, "allowed");
  assert.deepEqual(out.frontier.violations, []);
  assert.deepEqual(out.frontier.rules, FRONTIER_BODY_RULES.map((r) => r.migration),
    "the result says WHICH rules were checked, so an empty violations list is a measured pass");
  // EXACT identifier, not class: a predecessor of the required body does not satisfy the rule.
  assert.equal(frontierBodyViolations("0195_work_egress_purpose_and_execution_trace", ["claraWork_v2"]).length, 1);
});

test("637.pf: NO SCOPE CLEARS THE FRONTIER RULE — it counts no rows, so it cannot be narrowed away", async () => {
  const out = await preflight({
    query: emptyCensusQuery,
    supported: ["claraWork_v2"],
    scope: { workIds: ["00000000-0000-4000-8000-000000000001"] },
    frontier: "0195_work_egress_purpose_and_execution_trace",
  });
  assert.equal(out.verdict, "refused", "the GLOBAL verdict — the one the exit code follows — still refuses");
  assert.ok(out.reasons.includes("frontier_requires_body"));
  // …and the SCOPED verdict is deliberately untouched by it. A scope answers 'is my lane clear',
  // and this rule is about no lane at all; folding it in would make a scoped answer refuse for a
  // reason the scope can neither cause nor clear, which is the #637 review B2 lesson inverted.
  assert.equal(out.scoped.verdict, "allowed", "the scoped question is still answered on its own terms");
  assert.equal(out.scoped.reasons.includes("frontier_requires_body"), false);
});

test("637.pf: the frontier is READ from clara.schema_migrations when the caller does not supply one", { skip: SKIP }, async () => {
  // The production path: one read, the same `max(version)` aggregate clara.build_frontier() (0174)
  // reports to /api/build-info. Read here directly because this module connects as the BASE login
  // and that door is granted to clara_runtime alone.
  const version = await readMigrationFrontier(query);
  assert.match(String(version), /^\d{4}_/, `this rig's frontier is unreadable: ${JSON.stringify(version)}`);
  const out = await preflight({ query, supported: ["claraWork_v3"] });
  assert.equal(out.frontier.version, version, "preflight read the SAME frontier, without being told");
  assert.equal(out.frontier.measured, true);
  // On a rig at or past 0195 the rule is in force and a claraWork_v3-carrying target satisfies it;
  // below 0195 it is not in force. Either way the violations for THIS roster are empty — asserted
  // rather than assumed, so the cell means something on both sides of the frontier.
  assert.deepEqual(out.frontier.violations, []);
  if (migrationOrdinal(version) >= 195) {
    const missing = await preflight({ query, supported: ["claraWork_v2"] });
    assert.ok(missing.reasons.includes("frontier_requires_body"),
      `this rig is at ${version}; a target without claraWork_v3 must refuse (got ${JSON.stringify(missing.reasons)})`);
  }
});

test("637.pf: a read that THROWS is never answered as 'allowed'", { skip: SKIP }, async () => {
  await assert.rejects(
    () => preflight({ query: async () => { throw Object.assign(new Error("permission denied for schema workflow"), { code: "42501" }); }, supported: [] }),
    /permission denied/,
    "the error is let out; a preflight that could not look must never say go ahead",
  );
  await assert.rejects(() => preflight({ supported: [] }), TypeError);
  await assert.rejects(() => preflight({ query, supported: "claraWork_v1" }), TypeError);
});

test("637.pf: teardown", { skip: SKIP }, async () => {
  await rig.endPool();
});
