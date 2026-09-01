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

before(async () => {
  assert.equal(await pr2Ready(), true, "F-A5 PR-2 wrappers, grants and interactive allowlist rows must be present");
  // A fresh rig registers evaluate_metric v1 DARK by design. The estate suite's earlier epsilon
  // ceremony normally flips it; a focused run has no such predecessor, so establish that lawful
  // one-way premise here exactly as the F-A5 batteries do before building evaluated cells.
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
