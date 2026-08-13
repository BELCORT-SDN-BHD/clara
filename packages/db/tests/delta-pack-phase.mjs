import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, withActor, ROLES, requireWaveEDelta, exactEntrypoint, caught, errorDetail,
  buildWorld, freshDeltaClient, createStandardSets, pastMonthStart, mintPeriodWithMovement,
  proposeMetricDefinition, approveMetricDefinition, evaluateFsPackHuman, measure, metricAst,
  recordMetricAttempt, attemptReceiptRows,
} from "./delta-fixtures.mjs";

let world;

async function approvedDefinition(owner, client, tag) {
  const version = await proposeMetricDefinition(owner, {
    client, key: `pack_${tag}_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, version);
  return version;
}

async function fixture(owner, tag) {
  const client = await freshDeltaClient(owner, `pack-${tag}`);
  await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, {
    client, monthStart: await pastMonthStart(7), cents: 100,
  });
  return { client, ...fx };
}

export async function registerPackPhase(t) {
  await requireWaveEDelta();
  world = await buildWorld();

  await t.test("the pack driver is an authenticated-only pinned security definer in the primary freeze closure", async () => {
    const pack = await exactEntrypoint("evaluate_fs_pack_v1");
    assert.equal(pack.result, "jsonb");
    assert.equal(pack.prosecdef, true);
    assert.ok((pack.proconfig ?? []).includes("search_path=clara, pg_temp"));
    assert.equal((await rootQuery(`select not exists(select 1 from pg_proc p cross join lateral
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid=$1::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE') ok`, [pack.signature])).rows[0].ok, true);
    for (const [role, allowed] of [[ROLES.authenticated, true], [ROLES.agentRo, false],
      [ROLES.runtime, false], ["clara_runtime_login", false], [ROLES.wakeInteractive, false], [ROLES.wakeProactive, false]]) {
      if (role === "clara_runtime_login" && !(await rootQuery("select to_regrole($1) is not null ok", [role])).rows[0].ok) continue;
      assert.equal((await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [role, pack.signature])).rows[0].ok, allowed);
    }
    const primary = (await rootQuery("select id from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=1")).rows[0];
    assert.ok(primary, "the primary evaluator registry row exists");
    assert.ok((await rootQuery("select count(*)::int n from clara.evaluator_version_members where evaluator_version_id=$1 and member_signature=$2", [primary.id, "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)"])).rows[0].n === 1);
  });

  await t.test("the pack preserves definition order and exact replay returns the same ordered cells", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "order-replay");
    const versions = [await approvedDefinition(owner, fx.client, "first"), await approvedDefinition(owner, fx.client, "second")];
    const runId = randomUUID(), args = { client: fx.client, definitionVersions: [...versions].reverse(),
      periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId };
    const first = await evaluateFsPackHuman(owner, args), replay = await evaluateFsPackHuman(owner, args);
    assert.deepEqual(replay, first, "the pack operation receipt replays the exact ordered result");
    assert.deepEqual(first.cells.map((cell) => cell.definition_version_id), [...versions].reverse());
    assert.deepEqual(first.cells.map((cell) => cell.ordinal), [0, 1]);
    assert.deepEqual(first.definition_version_ids, args.definitionVersions);
    assert.deepEqual(first.period_ids, args.periodIds);
    assert.equal(first.client_id, fx.client);
    assert.deepEqual((await rootQuery(`select definition_version_id,id cell_id,cell_status from clara.metric_cells
      where client_id=$1 and run_id=$2 order by array_position($3::uuid[],definition_version_id)`, [fx.client, runId, args.definitionVersions])).rows,
    first.cells.map((cell) => ({ definition_version_id: cell.definition_version_id, cell_id: cell.cell_id, cell_status: cell.cell_status })));
    const durable = (await rootQuery("select result from clara.op_receipts where fn='evaluate_fs_pack_v1' and op_key=$1", [runId])).rows[0];
    assert.deepEqual(durable?.result, first, "the durable pack receipt stores the exact ordered replay shape");
  });

  await t.test("empty and duplicate definition or period arrays refuse without output", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "array-refusals"), version = await approvedDefinition(owner, fx.client, "valid");
    for (const [definitions, periods, expected] of [[[], [fx.period.id], ["definition_versions", "nonempty_nonnull"]],
      [[version, version], [fx.period.id], ["definition_versions", "unique"]],
      [[version], [], ["context_periods", "nonempty_nonnull"]],
      [[version], [fx.period.id, fx.period.id], ["context_periods", "unique"]]]) {
      const runId = randomUUID(), error = await caught(() => evaluateFsPackHuman(owner, {
        client: fx.client, definitionVersions: definitions, periodIds: periods, snapshotId: fx.snapshotId, runId,
      }));
      assert.equal(error?.code, "CLR10");
      assert.deepEqual([errorDetail(error).class, errorDetail(error).constraint], expected);
      assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where client_id=$1 and run_id=$2", [fx.client, runId])).rows[0].n, 0);
    }
  });

  await t.test("pack preflight reports the measured cells-per-run cost before evaluating", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "preflight-cost"), runId = randomUUID();
    const oversized = Array.from({ length: 5001 }, () => randomUUID());
    const error = await caught(() => evaluateFsPackHuman(owner, { client: fx.client,
      definitionVersions: oversized, periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId }));
    assert.equal(error?.code, "CLR10");
    assert.deepEqual(errorDetail(error), { reason: "cost_exceeded", class: "cells_per_run", limit: 5000,
      measured_count: 5001, existing_count: 0, requested_count: 5001 });
    assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where client_id=$1 and run_id=$2", [fx.client, runId])).rows[0].n, 0);
  });

  await t.test("a pack reuses an exact scalar cell instead of double-counting or minting it", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "scalar-reuse");
    const versions = [await approvedDefinition(owner, fx.client, "existing"), await approvedDefinition(owner, fx.client, "new")];
    const runId = randomUUID();
    const scalar = await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (db) =>
      (await db.query("select clara.evaluate_metric_v1($1,$2,$3,$4,$5) r", [fx.client, versions[0], [fx.period.id], fx.snapshotId, runId])).rows[0].r);
    const pack = await evaluateFsPackHuman(owner, { client: fx.client, definitionVersions: versions,
      periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId });
    assert.equal(pack.cells[0].cell_id, scalar.cell_id);
    assert.deepEqual(pack.cells.map((cell) => cell.ordinal), [0, 1]);
    assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where client_id=$1 and run_id=$2", [fx.client, runId])).rows[0].n, 2);
    assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='evaluate_metric_v1' and op_key like $1||':%'", [runId])).rows[0].n, 2);
  });

  await t.test("one valid then one invalid definition is atomic and leaves no cells, context, or receipts", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "atomic-invalid"), valid = await approvedDefinition(owner, fx.client, "valid"), invalid = randomUUID(), runId = randomUUID();
    const error = await caught(() => evaluateFsPackHuman(owner, { client: fx.client,
      definitionVersions: [valid, invalid], periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId }));
    assert.equal(error?.code, "CLR11");
    assert.equal(errorDetail(error).definition_version_id, invalid);
    assert.deepEqual((await rootQuery(`select
      (select count(*)::int from clara.metric_cells where client_id=$1 and run_id=$2) cells,
      (select count(*)::int from clara.metric_evaluation_contexts where client_id=$1 and run_id=$2) contexts,
      (select count(*)::int from clara.op_receipts where op_key=$3 or op_key like $3||':%') receipts`, [fx.client, runId, runId])).rows[0],
    { cells: 0, contexts: 0, receipts: 0 });
  });

  await t.test("statement timeout propagates 57014 and rolls back every earlier pack effect", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "timeout-rollback");
    const versions = [await approvedDefinition(owner, fx.client, "first"), await approvedDefinition(owner, fx.client, "blocked")];
    const runId = randomUUID(), firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
    const sentinel = new Error("rollback timeout blocker");
    const blocker = await caught(() => withActor({ transaction: true }, async (db) => {
      await db.query("insert into clara.op_receipts(firm_id,fn,op_key,request_hash)values($1,'evaluate_metric_v1',$2,sha256(convert_to($2,'UTF8')))", [firm, `${runId}:${versions[1]}`]);
      let pid;
      const timed = withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (caller) => {
        pid = (await caller.query("select pg_backend_pid() pid")).rows[0].pid;
        await caller.query("set local statement_timeout='2s'");
        return caller.query("select clara.evaluate_fs_pack_v1($1,$2,$3,$4,$5)", [fx.client, versions, [fx.period.id], fx.snapshotId, runId]);
      });
      timed.catch(() => {});
      while (pid === undefined) await new Promise((resolve) => setTimeout(resolve, 10));
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i += 1) {
        blocked = (await rootQuery("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1", [pid])).rows[0]?.blocked === true;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, "the pack reached the blocked second scalar receipt after evaluating its first definition");
      sentinel.timeoutError = await caught(() => timed);
      throw sentinel;
    }));
    assert.equal(blocker, sentinel);
    assert.equal(sentinel.timeoutError?.code, "57014");
    assert.deepEqual((await rootQuery(`select
      (select count(*)::int from clara.metric_cells where client_id=$1 and run_id=$2) cells,
      (select count(*)::int from clara.metric_evaluation_contexts where client_id=$1 and run_id=$2) contexts,
      (select count(*)::int from clara.op_receipts where firm_id=$3 and(op_key=$4 or op_key like $4||':%')) receipts,
      (select count(*)::int from clara.audit_log where firm_id=$3 and fn in('evaluate_metric_v1','evaluate_fs_pack_v1')and args->>'run_id'=$4) audits`, [fx.client, runId, firm, runId])).rows[0],
    { cells: 0, contexts: 0, receipts: 0, audits: 0 });
    assert.notEqual((await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (db) =>
      (await db.query("show statement_timeout")).rows[0].statement_timeout)), "2s", "pooled cleanup resets the cancelled caller's timeout");
    // A30b: the rollback above is intact, so the only durable trace of the cancelled attempt is an
    // attempt receipt recorded afterwards -- classed as a cancellation with its configured timeout,
    // never as a deterministic cost_exceeded, and carrying no fabricated cap numbers.
    const attemptKey = `pack-cancel-${runId}`;
    const receipt = await recordMetricAttempt(owner, { client: fx.client, runId, outcomeClass: "cancellation",
      attemptKey, configuredTimeout: "2s",
      diagnostics: { observed_sqlstate: sentinel.timeoutError.code, blocked_on: "the pre-reserved second scalar receipt" } });
    assert.deepEqual([receipt.recorded, receipt.outcome_class, receipt.sqlstate, receipt.configured_statement_timeout,
      receipt.existing_cell_count, receipt.new_required_cell_count, receipt.projected_cell_count, receipt.cell_limit],
    [true, "cancellation", "57014", "2s", null, null, null, null],
    "the cancelled pack leaves a cancellation receipt with its configured timeout and no cap numbers");
    const rows = await attemptReceiptRows(fx.client, runId);
    assert.deepEqual([rows.length, rows[0].entrypoint, rows[0].outcome_class],
      [1, "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)", "cancellation"]);
    assert.deepEqual((await rootQuery(`select
      (select count(*)::int from clara.metric_cells where client_id=$1 and run_id=$2) cells,
      (select count(*)::int from clara.metric_evaluation_contexts where client_id=$1 and run_id=$2) contexts,
      (select count(*)::int from clara.op_receipts where firm_id=$3 and(op_key=$4 or op_key like $4||':%')) receipts`,
    [fx.client, runId, firm, runId])).rows[0], { cells: 0, contexts: 0, receipts: 0 },
    "recording the attempt receipt adds no cell, no context and no operation receipt");
    const again = await recordMetricAttempt(owner, { client: fx.client, runId, outcomeClass: "cancellation",
      attemptKey, configuredTimeout: "2s" });
    assert.deepEqual([again.recorded, again.receipt_id, (await attemptReceiptRows(fx.client, runId)).length],
      [false, receipt.receipt_id, 1], "re-recording the same cancelled attempt keeps exactly one row");
  });

  await t.test("same-run pack context or definition-list reuse with different arguments fails closed", async () => {
    const owner = world.users.alice, fx = await fixture(owner, "mismatch"), versions = [await approvedDefinition(owner, fx.client, "first"), await approvedDefinition(owner, fx.client, "second")], runId = randomUUID();
    await evaluateFsPackHuman(owner, { client: fx.client, definitionVersions: versions,
      periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId });
    const reversed = await caught(() => evaluateFsPackHuman(owner, { client: fx.client,
      definitionVersions: [...versions].reverse(), periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId }));
    assert.equal(reversed?.code, "CLR10");
    assert.match(reversed.message, /op_key reused with different args/i);
    const other = await fixture(owner, "mismatch-other"), otherVersion = await approvedDefinition(owner, other.client, "other");
    const context = await caught(() => evaluateFsPackHuman(owner, { client: other.client,
      definitionVersions: [otherVersion], periodIds: [other.period.id], snapshotId: other.snapshotId, runId }));
    assert.equal(context?.code, "CLR10");
    const scalarRun = randomUUID();
    await withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true }, async (db) =>
      db.query("select clara.evaluate_metric_v1($1,$2,$3,$4,$5)", [fx.client, versions[0], [fx.period.id], fx.snapshotId, scalarRun]));
    const scalarFirstMismatch = await caught(() => evaluateFsPackHuman(owner, { client: other.client,
      definitionVersions: [otherVersion], periodIds: [other.period.id], snapshotId: other.snapshotId, runId: scalarRun }));
    assert.equal(scalarFirstMismatch?.code, "CLR10");
    assert.deepEqual(errorDetail(scalarFirstMismatch), { reason: "scope_mismatch", class: "run_context" });
    assert.equal((await rootQuery("select count(*)::int n from clara.metric_evaluation_contexts where client_id=$1 and run_id=$2", [other.client, scalarRun])).rows[0].n, 0);
  });
}
