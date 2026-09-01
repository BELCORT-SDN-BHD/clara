// FS-7 ECHELON-1 — chatTurn_v17's LIVE battery, against a real fully-migrated Postgres.
//
// THE POSITIVE CONTROL CALLS ALL THREE TOOLS, not merely their SQL wrappers. A report fixture is
// built through the estate's audited epsilon helpers; open_report_run opens a fresh run, while
// assess_report_claim and seal_report_dataset operate on the fixture's already-evaluated run.
// That distinction is load-bearing: seal auto-assesses and enqueues rendering, but its live core
// refuses a run with no evaluated metric cells. `wake_evaluate_report_pack` is deliberately not
// a v17 chat tool, so this file never pretends the ruled three calls form a complete evaluator
// chain by themselves.
//
// THE NEGATIVE CONTROL ANCHORS THE CLOSE STOP IN THE LIVE CATALOG. Inside one root transaction it
// temporarily admits `wake_begin_close` to `interactive_client`, mints the same plain task-less
// credential family a client-pinned chat tool can mint, then calls the real wrapper as
// clara_wake_interactive. The call reaches past grant, allowlist and client-pin checks and refuses
// CLR03 `wake_task_unbound`. ROLLBACK removes both temporary rows; a post-read proves the allowlist
// returned to its exact prestate. This is not a proposed product path — it is the discriminating
// control proving an allowlist-only migration could never make close tools chat-reachable.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import * as rig from "./rig.mjs";
import {
  mintWakeCredentialObo,
  mintWakeCredentialClientObo,
  withRuntime,
  withWriteWakeScoped,
  endPools,
} from "../lib/pools.mjs";
import {
  pr2Ready,
  buildPr2World,
  endPool as endDbFixturePool,
} from "../../db/tests/f-a5-reporting-agency-pr2-fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();
const tools17 = await import("../workflows/chatTurn.v17.tools.ts");
const prompt17 = await import("../workflows/chatTurn.v17.prompt.ts");

const priorPools = globalThis.__claraPools;
globalThis.__claraPools = {
  mintWakeCredentialObo,
  mintWakeCredentialClientObo,
  withWriteWakeScoped,
  withRuntime,
};

let fixture;

// ---------------------------------------------------------------------------
// This file's OWN throwaway database (PR #485 review round 2).
//
// CI's db-estate job runs every workspace package's tests CONCURRENTLY
// (`pnpm -r --if-present test`) against ONE shared Postgres target -- there is
// NO ordering between packages/db's and packages/runtime's test PROCESSES, and
// no "earlier ceremony" a sibling suite can be relied on to have already run
// before this one starts (the prior comment here claimed the estate suite's
// epsilon ceremony runs first; that is false -- the job provides no such
// ordering, concurrent packages race). This file's fixture needs
// `evaluate_metric@1` DEPLOYED to build an evaluated report run through the
// real audited path (buildPr2World's epsilon helpers). Flipping that row
// in-place used to happen on the SHARED estate database -- a platform-scoped
// row (firm_id is null) that packages/db's delta suite is concurrently
// exercising through evaluatorCeremonyUnwitnessed() (an any-of-five witness
// over five ceremony-covered evaluators). The witness stayed "fresh" (the
// other four evaluators were still undeployed) while the ONE evaluator the
// delta suite's own pre-ceremony refusal proofs call had, mid-run, already
// gone live -- turning a dozen-plus `assert.ok(error, ...)` proofs (packages/db
// cells 11,16-19,29,30,35-40,42,45-47,50,51,59) into false passes that then
// read as failures once the refusal never came.
//
// So this file stands up ITS OWN database on the SAME Postgres server (same
// host/port/user as whatever target the environment names, a different
// DATABASE name), migrates it fully, and points every pool this file's
// dependency chain can create at it BEFORE any of those pools does its first
// real checkout: relay-fixtures.mjs (rig.mjs) / lib/relay.mjs / lib/pools.mjs
// all resolve PGDATABASE / DATABASE_URL / WORKFLOW_POSTGRES_URL LIVE per
// connection (never cached at import), and so does packages/db/tests' own
// rig-helpers.mjs (which pr2Ready()/buildPr2World() use underneath) -- so
// redirecting those three env vars here, before before() does anything else,
// is sufficient to make EVERY connection this file opens land on the private
// database. The shared estate DB is never written by this file again.
let privateDbName = null;
let restoreDbEnv = null;

function disposableDbName() {
  const name = `fs7v17_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`refusing a non-bare disposable db name: ${name}`);
  return name;
}

/** A one-off connection to the CURRENT (ambient) target -- for CREATE/DROP DATABASE only, never schema work. */
function adminClientConfig() {
  const raw = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  return raw ? { connectionString: raw } : {};
}

async function createPrivateDatabase() {
  const name = disposableDbName();
  const client = new pg.Client(adminClientConfig());
  await client.connect();
  try {
    await client.query(`create database ${name}`);
  } finally {
    await client.end();
  }
  return name;
}

/** Point every env var this file's pool chain reads at `name`; returns the restorer. */
function pointDbEnvAt(name) {
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL,
    PGDATABASE: process.env.PGDATABASE,
  };
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
  }
  if (process.env.WORKFLOW_POSTGRES_URL) {
    const url = new URL(process.env.WORKFLOW_POSTGRES_URL);
    url.pathname = `/${name}`;
    process.env.WORKFLOW_POSTGRES_URL = url.toString();
  }
  process.env.PGDATABASE = name;
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function dropPrivateDatabase(name) {
  const client = new pg.Client(adminClientConfig());
  await client.connect();
  try {
    await client.query(`drop database if exists ${name} with (force)`);
  } finally {
    await client.end();
  }
}

before(async () => {
  privateDbName = await createPrivateDatabase();
  restoreDbEnv = pointDbEnvAt(privateDbName);
  const { migrate } = await import("../../db/scripts/migrate.mjs");
  await migrate({ log: () => {} });

  assert.equal(await pr2Ready(), true, "F-A5 PR-2 wrappers, grants and interactive allowlist rows must be present");
  // A fresh database registers evaluate_metric v1 DARK by design (0060's one-way
  // ceremony). This file's fixture needs it deployed to build an evaluated report
  // run -- establish that lawful one-way premise here, exactly as the F-A5
  // batteries do, on THIS PRIVATE database (see the file-header note above for why
  // it must never be done on the shared estate DB).
  await rig.asRoot(async (client) => {
    await client.query(
      `update clara.evaluator_versions set deployed=true
        where evaluator_name='evaluate_metric' and version=1 and firm_id is null and not deployed`,
    );
    const row = await client.query(
      "select deployed from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=1 and firm_id is null",
    );
    assert.equal(row.rows.length, 1, "evaluate_metric v1 resolves at exactly one platform row");
    assert.equal(row.rows[0].deployed, true, "the focused rig can evaluate the report fixture");
  });
  fixture = await buildPr2World("fs7-v17-report-chat");
});

after(async () => {
  globalThis.__claraPools = priorPools;
  await endPools();
  await rig.endPool();
  await endDbFixturePool();
  // Restore the ambient target BEFORE dropping -- DROP DATABASE must run from a
  // connection to a DIFFERENT database than the one being dropped, and every pool
  // above must already be closed or the drop refuses (WITH (FORCE) covers a
  // straggler, but restoring first keeps this from ever needing to rely on that).
  restoreDbEnv?.();
  if (privateDbName) {
    try {
      await dropPrivateDatabase(privateDbName);
    } catch (error) {
      // Best-effort only: CI's Postgres service container is itself thrown away at
      // the end of the job, so a leaked private database here costs nothing beyond
      // this one run -- never fail the suite over teardown.
      console.error(`fs7-v17-chatturn-db: could not drop ${privateDbName}: ${error?.message ?? error}`);
    }
  }
});

async function execute(tool, input, toolCallId) {
  assert.equal(typeof tool?.execute, "function", `${toolCallId}: the AI tool exposes execute()`);
  return tool.execute(input, {
    toolCallId,
    messages: [],
    abortSignal: new AbortController().signal,
  });
}

test("fs7.v17.db.report-tools: open, assess and seal each reach their live interactive wrapper", async () => {
  const { world, eps } = fixture;
  const ctx = {
    firmId: world.firms.A,
    clientId: eps.client,
    createdBy: world.users.alice,
    taskId: randomUUID(),
  };
  const toolset = tools17.buildToolsV17(ctx, "gpt-5.6-terra", 0);

  const opened = await execute(
    toolset[tools17.OPEN_REPORT_RUN_TOOL],
    {
      report_spec_version_id: eps.spec.report_spec_version_id,
      books_snapshot_id: eps.snapshotId,
      reporting_period_id: eps.period.id,
      rationale: "Open the management-accounts run the human requested.",
    },
    "fs7-open",
  );
  assert.equal(opened.ok, true, `open_report_run succeeds: ${JSON.stringify(opened).slice(0, 400)}`);
  assert.ok(opened.result?.report_run_id, "the wrapper's own report_run_id rides through unchanged");

  const openedCells = await rig.rootQuery(
    "select count(*)::int as n from clara.metric_cells where run_id=$1",
    [opened.result.report_run_id],
  );
  assert.equal(openedCells.rows[0].n, 0, "control: opening does not silently perform pack evaluation");

  const assessed = await execute(
    toolset[tools17.ASSESS_REPORT_CLAIM_TOOL],
    {
      report_run_id: eps.runId,
      rationale: "Assess the already-evaluated management-accounts run before sealing.",
    },
    "fs7-assess",
  );
  assert.equal(assessed.ok, true, `assess_report_claim succeeds: ${JSON.stringify(assessed).slice(0, 400)}`);
  assert.ok(assessed.result?.claim_assessment_id, "the wrapper's assessment receipt rides through unchanged");

  const sealed = await execute(
    toolset[tools17.SEAL_REPORT_DATASET_TOOL],
    {
      report_run_id: eps.runId,
      chart_template_version_ids: [],
      rationale: "Seal the assessed management-accounts dataset and queue its render.",
    },
    "fs7-seal",
  );
  assert.equal(sealed.ok, true, `seal_report_dataset succeeds: ${JSON.stringify(sealed).slice(0, 400)}`);
  assert.equal(sealed.result?.state, "dataset_sealed");

  const render = await rig.rootQuery(
    "select count(*)::int as n from clara.render_jobs where report_run_id=$1 and kind='pre_sign'",
    [eps.runId],
  );
  assert.equal(render.rows[0].n, 1, "seal's existing core enqueued exactly one pre_sign render job");

  const receipts = await rig.rootQuery(
    `select act, model, model_version
       from clara.report_agent_receipts
      where report_run_id = any($1::uuid[])
        and act = any(array['open_run','assess_claim','seal_dataset'])
      order by act`,
    [[opened.result.report_run_id, eps.runId]],
  );
  assert.deepEqual(receipts.rows.map((row) => row.act), ["assess_claim", "open_run", "seal_dataset"]);
  assert.ok(receipts.rows.every((row) => row.model === "gpt-5.6-terra" && row.model_version === "chatTurn_v17"));

  const narrative = prompt17.toTypedParts_v17([
    { type: "tool-result", toolCallId: "fs7-open", toolName: tools17.OPEN_REPORT_RUN_TOOL, output: opened },
    { type: "tool-result", toolCallId: "fs7-assess", toolName: tools17.ASSESS_REPORT_CLAIM_TOOL, output: assessed },
    { type: "tool-result", toolCallId: "fs7-seal", toolName: tools17.SEAL_REPORT_DATASET_TOOL, output: sealed },
  ]);
  assert.equal(
    narrative.filter((part) => part.type === "agent_receipt").length,
    0,
    "report results stay narrative; the dead report_agent shim is not papered over with a card",
  );
});

test("fs7.v17.db.close-stop: a chat-mintable client credential remains task-unbound after the allowlist wall is removed", async () => {
  const { world, eps } = fixture;
  const proposed = await rig.humanQuery(
    world.users.alice,
    "select clara.propose_fiscal_year($1,$2::date) as r",
    [eps.client, "2026-01-01"],
  );
  const fiscalYear = await rig.humanQuery(
    world.users.alice,
    "select clara.open_fiscal_year($1,$2,$3::date,$4::date,$5,$6) as r",
    [eps.client, "FY2026 close-wall probe", "2026-01-01", proposed.rows[0].r.ends_on, null, `fs7-fy-${randomUUID()}`],
  );
  assert.ok(fiscalYear.rows[0].r.fiscal_year_id, "the close probe uses a real fiscal year of the credential-pinned client");
  const pre = await rig.rootQuery(
    `select count(*)::int as n from clara.wake_fn_allowlist
      where wake_kind='interactive_client' and function_name='wake_begin_close'`,
  );

  const error = await rig.asRoot(async (client) => {
    await client.query("begin");
    try {
      await client.query(
        `insert into clara.wake_fn_allowlist(wake_kind,function_name)
         values ('interactive_client','wake_begin_close') on conflict do nothing`,
      );
      const minted = await client.query(
        `select * from clara.mint_wake_credential($1,$2,$3,'15 minutes'::interval,$4)`,
        ["interactive_client", world.firms.A, world.users.alice, eps.client],
      );
      await client.query("select set_config('clara.wake_secret',$1,true)", [minted.rows[0].secret]);
      await client.query("set local role clara_wake_interactive");
      try {
        await client.query(
          "select clara.wake_begin_close($1::uuid,$2::text,$3::jsonb,$4::text)",
          [fiscalYear.rows[0].r.fiscal_year_id, "live proof of the chat task-binding wall", JSON.stringify({ model: "gpt-5.6-terra", model_version: "chatTurn_v17" }), "fs7-chat-unbound"],
        );
        return null;
      } catch (caught) {
        return caught;
      }
    } finally {
      await client.query("rollback").catch(() => {});
    }
  });

  assert.equal(error?.code, "CLR03", "the real close wrapper refuses the plain chat-originated credential");
  assert.match(String(error?.detail ?? ""), /wake_task_unbound/, "the refusal is specifically the missing agent_task_id wall");

  const post = await rig.rootQuery(
    `select count(*)::int as n from clara.wake_fn_allowlist
      where wake_kind='interactive_client' and function_name='wake_begin_close'`,
  );
  assert.equal(post.rows[0].n, pre.rows[0].n, "rollback restored the shared allowlist to its exact prestate");
});
