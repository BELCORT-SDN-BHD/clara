// #637 (C54.2) — the rollback preflight, against a REAL Postgres rig under the real relations.
//
// WHAT THESE CELLS PROVE, and why each needs a database rather than a stub:
//
//   * A non-terminal run on a body the TARGET image does not carry REFUSES the rollback, and the
//     refusal NAMES the body. Derived from the run row's own `name`, never from a literal — the
//     version-cutover e2e's hard-won rule (a hardcoded version went stale the moment a later PR
//     repointed the registry).
//   * A queued `accounting_work` task with `workflow_run_id IS NULL` refuses ON ITS OWN, with an
//     empty `workflow.workflow_runs` in scope. This is the leg nothing counted: the task exists
//     from the moment `clara.admit_journal_work` commits and the run only exists once a worker
//     picks it up, so a run census alone reports a clean estate while admitted Work waits for a
//     body the target does not have. The README already said the lane parks; nothing measured it.
//   * SCOPE (#708). Twenty unrelated parked runs of another workflow name are present, the scope
//     names only the runs this file staged, and the verdict is `allowed`. That is the defect
//     filed as #708, reproduced here as a pass/fail line rather than as a shared-rig anecdote.
//
// GATED, positively, on the catalog: `clara.agent_tasks` must admit the `accounting_work` kind
// (migration 0178) and the WDK `workflow.workflow_runs` relation must exist (the world
// bootstrap). `node --test` has no file-level skip, so every cell carries its own `{ skip }` —
// the shape the rest of this suite uses for a migration-gated file.
//
// Runs as ROOT rather than through a pool, and that is a statement about the estate rather than
// test convenience: `clara_runtime` has no USAGE on the `workflow` schema at all (measured), so
// the preflight's own production door opens a base-login connection to the WORLD's DSN. The rig's
// `rootQuery` is that same identity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import * as rig from "./rig.mjs";
import {
  bodyIdentifierOf,
  censusNonTerminalRuns,
  censusUnboundAccountingWork,
  preflight,
  strandedBodyCensus,
  supportedBodiesFromBundle,
} from "../lib/rollback-preflight.mjs";

/** Positive catalog probe — the two relations these cells actually read. */
async function preflightReady() {
  try {
    const r = await rig.rootQuery(`
      select to_regclass('workflow.workflow_runs') is not null as runs_tbl,
             to_regclass('clara.accounting_work') is not null as work_tbl,
             to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit
    `);
    const row = r.rows[0] ?? {};
    return Boolean(row.runs_tbl && row.work_tbl && row.admit);
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await preflightReady());
const SKIP = READY ? false : "the WDK world (workflow.workflow_runs) or migration 0178 is absent from this database";

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

const basis = () => ({
  posting_date: "2026-09-07",
  memo: "office rent — preflight fixture",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 44400, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 44400, description: "Maybank" },
  ],
});

/** Admit real Work through the real door and leave it UNBOUND: no engine runs in this process,
 *  so the queued `accounting_work` task never acquires a `workflow_run_id`. */
async function admitUnboundWork(label) {
  const { owner, client } = await rig.buildFirm(label);
  const receipt = await rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client,
        owner,
        `preflight_${randomUUID()}`,
        JSON.stringify(basis()),
        "user_direct",
        JSON.stringify([]),
        rig.DEFAULT_MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);
  return receipt;
}

// ---------------------------------------------------------------------------
// Pure derivations — no database needed, and they are what everything else rests on.
// ---------------------------------------------------------------------------

test("637.pf: the body identifier is derived from the run ROW's own WDK name", () => {
  assert.equal(bodyIdentifierOf("workflow//./workflows/claraWork.v1//claraWork_v1"), "claraWork_v1");
  assert.equal(bodyIdentifierOf("workflow//./workflows/chatTurn.v18//chatTurn_v18"), "chatTurn_v18");
  assert.equal(bodyIdentifierOf("workflow//./workflows/closeExample.v1//closeExampleV1"), "closeExampleV1");
  // An unrecognised name is returned VERBATIM rather than nulled: it must stay comparable against
  // the supported set, and comparing it verbatim is exactly what makes it refuse.
  assert.equal(bodyIdentifierOf("something-else-entirely"), "something-else-entirely");
  assert.equal(bodyIdentifierOf(""), "");
  assert.equal(bodyIdentifierOf(null), "");
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
// The census and the verdict, on the rig.
// ---------------------------------------------------------------------------

test("637.pf: a non-terminal run on a body the TARGET image lacks REFUSES, and the refusal names it", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2");
  try {
    const out = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [staged.id] } });
    assert.equal(out.verdict, "refused");
    assert.ok(out.reasons.includes("unsupported_body"), `reasons name the unsupported body; got ${JSON.stringify(out.reasons)}`);
    assert.equal(out.outside.length, 1);
    assert.equal(out.outside[0].body, "claraWork_v2", "the refusal NAMES the body, derived from the row");
    assert.equal(out.outside[0].name, staged.name, "…and carries the full run name an operator can grep for");
    assert.equal(out.outside[0].count, 1);

    // The SAME staged run against a supported set that DOES carry v2 is allowed — so the refusal
    // above is about the supported set, not about the row merely existing.
    const ok = await preflight({ query, supported: ["claraWork_v1", "claraWork_v2"], scope: { runIds: [staged.id] } });
    assert.equal(ok.verdict, "allowed");
    assert.deepEqual(ok.outside, []);
  } finally {
    await rig.rootQuery("delete from workflow.workflow_runs where id = $1", [staged.id]);
  }
});

test("637.pf: a TERMINAL run on an unsupported body does not refuse — the census is of live state", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2", { status: "completed" });
  try {
    const out = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [staged.id] } });
    assert.equal(out.verdict, "allowed");
    assert.deepEqual(out.runs, [], "a completed run is not in flight and is not inventoried");
  } finally {
    await rig.rootQuery("delete from workflow.workflow_runs where id = $1", [staged.id]);
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
    assert.equal(refused.verdict, "refused");
    assert.ok(
      refused.reasons.includes("unbound_accounting_work"),
      `the reason is its own, not folded into unsupported_body; got ${JSON.stringify(refused.reasons)}`,
    );
    assert.deepEqual(refused.outside, [], "no workflow RUN is unsupported — this refusal comes from the task census alone");
    assert.equal(refused.unbound.count, 1);
    assert.equal(refused.unbound.tasks[0].id, receipt.task_id);

    // A target image that carries ANY claraWork body can run it: an unbound task has not chosen a
    // version yet, so what it needs is that the CLASS exists there at all.
    const allowed = await preflight({ query, supported: ["claraWork_v1"], scope: { workIds: [receipt.work_id] } });
    assert.equal(allowed.verdict, "allowed");
    assert.equal(allowed.unbound.count, 1, "…the task is still COUNTED; it simply does not strand");
    assert.equal(allowed.unbound.strands, false);
  } finally {
    // CANCELLED, never deleted: `clara.agent_tasks` refuses a DELETE outright (CLR08,
    // t_agent_task_no_truncate's sibling guard) and `clara.accounting_work` is immutable by
    // trigger. Taking the task terminal is the only honest way to stop a fixture from counting,
    // and it is what a real operator would do with an admitted Work they decided against.
    await rig.rootQuery("update clara.agent_tasks set status = 'cancelled' where id = $1", [receipt.task_id]);
  }
});

test("637.pf: #708 — an explicit scope answers about THIS caller's runs, with 20 unrelated parked runs present", { skip: SKIP }, async () => {
  const noise = [];
  for (let i = 0; i < 20; i += 1) noise.push(await stageRun("chatTurn_v18"));
  const mine = await stageRun("claraWork_v1");
  try {
    // UNSCOPED, the answer is dominated by runs this caller never staged — the #708 shape, on a
    // shared rig, reproduced as an assertion rather than described.
    const global = await preflight({ query, supported: ["claraWork_v1"] });
    assert.equal(global.verdict, "refused");
    assert.ok(
      global.outside.some((row) => row.body === "chatTurn_v18"),
      "the unscoped census refuses for a reason unrelated to the cutover under test",
    );

    // SCOPED to the run this caller staged, the verdict depends solely on it.
    const scoped = await preflight({ query, supported: ["claraWork_v1"], scope: { runIds: [mine.id] } });
    assert.equal(scoped.verdict, "allowed");
    assert.equal(scoped.scoped, true, "the result says it was narrowed — a narrowed verdict must never read as a global one");
    assert.equal(scoped.runs.length, 1);
    assert.equal(scoped.runs[0].body, "claraWork_v1");

    // A NAME filter is the other admissible scope, and reaches the same answer from the other side.
    const byName = await preflight({ query, supported: ["chatTurn_v18"], scope: { nameLike: "chatTurn.v18" } });
    assert.equal(byName.verdict, "allowed");
    assert.equal(byName.runs.reduce((n, row) => n + row.count, 0), 20);
  } finally {
    await rig.rootQuery("delete from workflow.workflow_runs where id = any($1::text[])", [[mine.id, ...noise.map((r) => r.id)]]);
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

    const unbound = await censusUnboundAccountingWork(query, { taskIds: [randomUUID()] });
    assert.deepEqual(unbound, [], "a scope that names nothing real returns nothing, never everything");
  } finally {
    await rig.rootQuery("delete from workflow.workflow_runs where id = any($1::text[])", [[a.id, b.id]]);
  }
});

test("637.pf: the BOOT census names the bodies live runs are parked on that THIS image does not carry", { skip: SKIP }, async () => {
  const staged = await stageRun("claraWork_v2");
  try {
    const carriedWithout = await strandedBodyCensus({
      query: (sql, params) => query(sql, params),
      carried: ["claraWork_v1", "chatTurn_v18"],
    });
    assert.equal(carriedWithout.measured, true);
    assert.ok(carriedWithout.names.includes("claraWork_v2"), "the stranded body is named");
    assert.ok(carriedWithout.stranded >= 1);

    const carriedWith = await strandedBodyCensus({
      query: (sql, params) => query(sql, params),
      carried: ["claraWork_v1", "claraWork_v2", "chatTurn_v18"],
    });
    assert.equal(carriedWith.names.includes("claraWork_v2"), false, "an image that carries the body strands nothing of it");
  } finally {
    await rig.rootQuery("delete from workflow.workflow_runs where id = $1", [staged.id]);
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
