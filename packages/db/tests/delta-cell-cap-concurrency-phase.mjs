import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, withActor, ROLES, buildWorld, requireWaveEDelta, errorDetail, caught,
  freshDeltaClient, pastMonthStart, createStandardSets, mintPeriodWithMovement,
  proposeMetricDefinition, approveMetricDefinition, evaluateMetricHuman, evaluateFsPackHuman, cellRow,
  expectFnOwnerInsertRefusal, expectFnOwnerActionRefusal, recordMetricAttempt, attemptReceiptRows,
  assertBehavioralTimeoutCaps, measure, constant, metricAst,
} from "./delta-fixtures.mjs";

let world;

async function approvedDefinition(owner, client, tag) {
  const version = await proposeMetricDefinition(owner, {
    client, key: `run_cap_${tag}_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, version);
  return version;
}

async function invoke(owner, { tag, client, version, periodIds, snapshotId, runId, ready }) {
  try {
    const receipt = await withActor(
      { role: ROLES.authenticated, jwtSub: owner, transaction: true },
      async (db) => {
        ready((await db.query("select pg_backend_pid() pid")).rows[0].pid);
        return (await db.query(
          "select clara.evaluate_metric_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5::uuid) r",
          [client, version, periodIds, snapshotId, runId],
        )).rows[0].r;
      },
    );
    return { tag, receipt };
  } catch (error) {
    error.raceTag = tag;
    throw error;
  }
}

export async function registerCellCapPhase(t) {
  await requireWaveEDelta();
  world = await buildWorld();

  // i1: a run is one immutable evaluation context FIRM-WIDE, not merely per client. Proved with ample
  // cap headroom so the refusal cannot be a cost refusal wearing a scope refusal's name.
  await t.test("one run is one immutable context firm-wide: a second client on the same run refuses by name", async () => {
    const owner = world.users.alice, runId = randomUUID(), fixtures = [];
    for (const tag of ["first", "second"]) {
      const client = await freshDeltaClient(owner, `run-singularity-${tag}`);
      await createStandardSets(owner, client);
      const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(6), cents: 100 });
      fixtures.push({ client, version: await approvedDefinition(owner, client, `singularity_${tag}`), ...fx });
    }
    const [a, b] = fixtures;
    assert.equal((await rootQuery("select count(distinct firm_id)::int n from clara.clients where id=any($1::uuid[])",
      [[a.client, b.client]])).rows[0].n, 1, "the two clients positively share one firm");
    const won = await cellRow(await evaluateMetricHuman(owner, {
      client: a.client, definitionVersion: a.version, periodIds: [a.period.id], snapshotId: a.snapshotId, runId,
    }));
    assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where firm_id=$1 and run_id=$2", [won.firm_id, runId])).rows[0].n,
      1, "the run holds one cell, so the ceiling has ample headroom and cannot explain the refusal below");
    const error = await caught(() => evaluateMetricHuman(owner, {
      client: b.client, definitionVersion: b.version, periodIds: [b.period.id], snapshotId: b.snapshotId, runId,
    }));
    assert.equal(error?.code, "CLR10", `${error?.code} ${error?.message}`);
    assert.deepEqual(errorDetail(error), { reason: "scope_mismatch", class: "run_context" },
      "the scalar path answers with the named firm-wide ambiguity, not a bare unique violation");
    assert.deepEqual((await rootQuery(`select
        (select count(*)::int from clara.metric_evaluation_contexts where firm_id=$1 and run_id=$2) contexts,
        (select count(*)::int from clara.metric_cells where firm_id=$1 and run_id=$2) cells,
        (select count(*)::int from clara.metric_evaluation_contexts where client_id=$3 and run_id=$2) refused_contexts`,
    [won.firm_id, runId, b.client])).rows[0], { contexts: 1, cells: 1, refused_contexts: 0 },
    "the firm keeps exactly one context for the run and the refused client leaves nothing behind");
    const structural = await expectFnOwnerInsertRefusal(
      `insert into clara.metric_evaluation_contexts(firm_id,client_id,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by)
         select firm_id,$1,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by
           from clara.metric_evaluation_contexts where firm_id=$2 and run_id=$3`, [b.client, won.firm_id, runId]);
    assert.equal(structural.code, "23505", `${structural.code} ${structural.message}`);
    assert.match(structural.message, /uq_metric_evaluation_contexts_firm_run/i,
      "the behavioural refusal stands on a firm-wide unique index, not on the entrypoint alone");
  });

  await t.test(
    "two public sessions serialize the 5,000-cells-per-firm-run ceiling without partial output",
    async () => {
      const owner = world.users.alice;
      const client = await freshDeltaClient(owner, "concurrent-run-cap-corpus");
      await createStandardSets(owner, client);
      const fx = await mintPeriodWithMovement(owner, {
        client, monthStart: await pastMonthStart(7), cents: 100,
      });
      const seedVersion = await approvedDefinition(owner, client, "corpus");
      const runId = randomUUID();
      const seed = await cellRow(await evaluateMetricHuman(owner, {
        client, definitionVersion: seedVersion, periodIds: [fx.period.id],
        snapshotId: fx.snapshotId, runId,
      }));
      // The 5,000 ceiling counts EVERY metric-cell status, so the corpus carries a genuine non-ok
      // cell: if the count query ever filtered to 'ok' the boundary below would arrive one cell late.
      const zeroVersion = await proposeMetricDefinition(owner, {
        client, key: `run_cap_zero_${randomUUID()}`, unit: "money", resultScale: 0,
        ast: metricAst({ root: { node: "divide", num: measure({ set: "revenue" }), den: constant("zero") }, unit: "money", resultScale: 0 }),
      });
      await approveMetricDefinition(owner, zeroVersion);
      const nonOk = await cellRow(await evaluateMetricHuman(owner, {
        client, definitionVersion: zeroVersion, periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId,
      }));
      assert.deepEqual([nonOk.cell_status, nonOk.exact_numerator, nonOk.na_reason_version_id !== null],
        ["undefined", null, true], "the run positively holds a non-ok cell before the ceiling is measured");
      const context = (await rootQuery(
        "select * from clara.metric_evaluation_contexts where id=$1",
        [seed.evaluation_context_id],
      )).rows[0];
      assert.equal(nonOk.evaluation_context_id, context.id, "both real cells share the one run context");
      const definition = (await rootQuery(`select dv.ast,dv.allow_negative,dv.edge_policy_set_id,
          dv.averaging_policy_id,ap.policy_key from clara.metric_definition_versions dv
          join clara.averaging_policy_versions ap on ap.id=dv.averaging_policy_id where dv.id=$1`,
      [seedVersion])).rows[0];
      const composition = {
        evaluator_entrypoint: "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)",
        ast: definition.ast,
        allow_negative: definition.allow_negative,
        averaging_policy: definition.policy_key,
      };
      const hashes = (await rootQuery(`select clara._hash($2::jsonb) formula,
          clara._metric_resolved_inputs_sha256_v1(ec.context_sha256,
            (select array_agg(period_id order by ordinal) from clara.metric_evaluation_context_periods where context_id=ec.id),
            ec.firm_id,ec.client_id,null,clara._hash($2::jsonb),
            (select coalesce(array_agg(account_set_version_id order by account_set_version_id),'{}') from clara.metric_cell_account_sets where cell_id=$3),
            (select coalesce(array_agg(constant_version_id order by constant_version_id),'{}') from clara.metric_cell_constants where cell_id=$3),
            $4,$5,ec.evaluator_version_id,$6) resolved
          from clara.metric_evaluation_contexts ec where ec.id=$1`, [
        context.id, composition, seed.id, definition.edge_policy_set_id,
        definition.averaging_policy_id, seed.books_watermark,
      ])).rows[0];
      const inputs = {
        ...seed.inputs,
        schema: "clara.metric-composition-inputs/v1",
        composition,
      };
      const inserted = await withActor(
        { role: ROLES.fnOwner, transaction: true },
        async (db) => {
          await db.query("set constraints clara.t_metric_cell_integrity deferred");
          await db.query("create temporary table delta_cap_cells(id uuid primary key) on commit drop");
          const result = await db.query(`with minted as (
              insert into clara.metric_cells(firm_id,client_id,run_id,evaluation_context_id,
                definition_version_id,formula_sha256,resolved_inputs_sha256,evaluator_version_id,
                books_watermark,cell_status,na_reason_version_id,exact_numerator,exact_denominator,
                unit_key,displayed_scale,displayed_text,inputs,model_proposal_provenance,
                human_approval_provenance)
              select c.firm_id,c.client_id,c.run_id,c.evaluation_context_id,null,$2,$3,
                c.evaluator_version_id,c.books_watermark,c.cell_status,c.na_reason_version_id,
                c.exact_numerator,c.exact_denominator,c.unit_key,c.displayed_scale,c.displayed_text,
                $4::jsonb,c.model_proposal_provenance,c.human_approval_provenance
                from clara.metric_cells c cross join generate_series(1,4997) where c.id=$1
              returning id)
            insert into delta_cap_cells select id from minted returning id`,
          [seed.id, hashes.formula, hashes.resolved, inputs]);
          for (const sql of [
            `insert into clara.metric_cell_periods select i.id,p.firm_id,p.client_id,p.period_id,
              p.period_start,p.period_end,p.ordinal from delta_cap_cells i
              cross join clara.metric_cell_periods p where p.cell_id=$1`,
            `insert into clara.metric_cell_snapshots select i.id,p.firm_id,p.client_id,p.snapshot_id
              from delta_cap_cells i cross join clara.metric_cell_snapshots p where p.cell_id=$1`,
            `insert into clara.metric_cell_account_sets select i.id,p.firm_id,p.client_id,p.account_set_version_id
              from delta_cap_cells i cross join clara.metric_cell_account_sets p where p.cell_id=$1`,
            `insert into clara.metric_cell_constants select i.id,p.firm_id,p.client_id,p.constant_version_id
              from delta_cap_cells i cross join clara.metric_cell_constants p where p.cell_id=$1`,
            `insert into clara.metric_cell_entries select i.id,p.firm_id,p.client_id,p.entry_id
              from delta_cap_cells i cross join clara.metric_cell_entries p where p.cell_id=$1`,
            `insert into clara.metric_cell_documents select i.id,p.firm_id,p.client_id,p.document_id
              from delta_cap_cells i cross join clara.metric_cell_documents p where p.cell_id=$1`,
            `insert into clara.metric_cell_presentation_maps
              select i.id,p.firm_id,p.client_id,p.presentation_map_version_id from delta_cap_cells i
              cross join clara.metric_cell_presentation_maps p where p.cell_id=$1`,
          ]) await db.query(sql, [seed.id]);
          await db.query("set constraints clara.t_metric_cell_integrity immediate");
          return result.rowCount;
        },
      );
      assert.equal(inserted, 4997);
      // The deferred completeness belt must refuse an OMITTED provenance family, not just a wrong
      // one. An absent key yields zero elements from jsonb_array_elements_text, so before the fix it
      // compared equal to an empty child table and passed — a belt that failed open precisely where
      // the primary integrity trigger has been bypassed, which is the only case it exists for. The
      // primary wall is lifted here (transactionally; the refusal rolls it back) so the belt is what
      // answers, which is the only way to measure the belt rather than the wall in front of it.
      for (const family of ["entry_ids", "account_set_version_ids", "period_ids"]) {
        const omitted = await expectFnOwnerActionRefusal(async (db) => {
          await db.query("alter table clara.metric_cells disable trigger t_metric_cell_integrity");
          const stripped = { ...inputs, normalized_provenance: { ...inputs.normalized_provenance } };
          delete stripped.normalized_provenance[family];
          const minted = (await db.query(`insert into clara.metric_cells(firm_id,client_id,run_id,evaluation_context_id,
              definition_version_id,formula_sha256,resolved_inputs_sha256,evaluator_version_id,books_watermark,
              cell_status,na_reason_version_id,exact_numerator,exact_denominator,unit_key,displayed_scale,
              displayed_text,inputs,model_proposal_provenance,human_approval_provenance)
            select c.firm_id,c.client_id,c.run_id,c.evaluation_context_id,null,$2,$3,c.evaluator_version_id,
              c.books_watermark,c.cell_status,c.na_reason_version_id,c.exact_numerator,c.exact_denominator,
              c.unit_key,c.displayed_scale,c.displayed_text,$4::jsonb,c.model_proposal_provenance,
              c.human_approval_provenance from clara.metric_cells c where c.id=$1 returning id`,
          [seed.id, hashes.formula, hashes.resolved, stripped])).rows[0].id;
          for (const [table, tail] of [["periods", "period_id,period_start,period_end,ordinal"], ["snapshots", "snapshot_id"],
            ["account_sets", "account_set_version_id"], ["constants", "constant_version_id"], ["entries", "entry_id"],
            ["documents", "document_id"], ["presentation_maps", "presentation_map_version_id"]]) {
            await db.query(`insert into clara.metric_cell_${table}(cell_id,firm_id,client_id,${tail})
              select $1,firm_id,client_id,${tail} from clara.metric_cell_${table} where cell_id=$2`, [minted, seed.id]);
          }
          await db.query("set constraints all immediate");
        });
        assert.equal(omitted.code, "CLR11", `${family}: ${omitted.code} ${omitted.message}`);
        assert.match(omitted.message, /omits the .* family/i, family);
        assert.deepEqual([errorDetail(omitted).reason, errorDetail(omitted).manifest_key],
          ["normalized_provenance_family_absent", family],
          `the belt names the exact omitted family (${family}), not a generic mismatch`);
      }
      assert.equal((await rootQuery(
        "select count(*)::int n from pg_trigger where tgrelid='clara.metric_cells'::regclass and tgname='t_metric_cell_integrity' and tgenabled='O'",
      )).rows[0].n, 1, "the lifted primary wall is restored by the rollback");
      const count = () => rootQuery(
        "select count(*)::int n from clara.metric_cells where firm_id=$1 and run_id=$2",
        [context.firm_id, runId],
      );
      assert.equal((await count()).rows[0].n, 4999);
      const provenance = (await rootQuery(`with rc as (
          select id from clara.metric_cells where firm_id=$1 and run_id=$2)
        select
          (select count(*)::int from clara.metric_cell_periods p join rc on rc.id=p.cell_id) periods,
          (select count(*)::int from clara.metric_cell_snapshots p join rc on rc.id=p.cell_id) snapshots,
          (select count(*)::int from clara.metric_cell_account_sets p join rc on rc.id=p.cell_id) account_sets,
          (select count(*)::int from clara.metric_cell_constants p join rc on rc.id=p.cell_id) constants,
          (select count(*)::int from clara.metric_cell_entries p join rc on rc.id=p.cell_id) entries,
          (select count(*)::int from clara.metric_cell_documents p join rc on rc.id=p.cell_id) documents,
          (select count(*)::int from clara.metric_cell_presentation_maps p join rc on rc.id=p.cell_id) maps`,
      [context.firm_id, runId])).rows[0];
      const cellProvenance = async (id) => (await rootQuery(`select
          (select count(*)::int from clara.metric_cell_periods where cell_id=$1) periods,
          (select count(*)::int from clara.metric_cell_snapshots where cell_id=$1) snapshots,
          (select count(*)::int from clara.metric_cell_account_sets where cell_id=$1) account_sets,
          (select count(*)::int from clara.metric_cell_constants where cell_id=$1) constants,
          (select count(*)::int from clara.metric_cell_entries where cell_id=$1) entries,
          (select count(*)::int from clara.metric_cell_documents where cell_id=$1) documents,
          (select count(*)::int from clara.metric_cell_presentation_maps where cell_id=$1) maps`,
      [id])).rows[0];
      const seedProvenance = await cellProvenance(seed.id), nonOkProvenance = await cellProvenance(nonOk.id);
      for (const key of Object.keys(seedProvenance)) {
        assert.equal(provenance[key], seedProvenance[key] * 4998 + nonOkProvenance[key],
          `all 4,999 cells carry complete applicable ${key} provenance`);
      }
      // i1 makes a run one context FIRM-WIDE, so the two racers contend on the same client and run:
      // what is raced is the last free cell under the ceiling, never a second evaluation context.
      const racers = [];
      for (const tag of ["left", "right"]) racers.push({
        tag, client, version: await approvedDefinition(owner, client, tag),
        periodIds: [fx.period.id], snapshotId: fx.snapshotId,
      });
      const beforeContexts = (await rootQuery(
        "select count(*)::int n from clara.metric_evaluation_contexts where firm_id=$1 and run_id=$2",
        [context.firm_id, runId],
      )).rows[0].n;
      const beforeReceipts = (await rootQuery(
        "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='evaluate_metric_v1' and op_key like $2",
        [context.firm_id, `${runId}:%`],
      )).rows[0].n;
      const hold = await withActor({ transaction: true }, async (db) => {
        await db.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [`${context.firm_id}:${runId}`],
        );
        const pids = [];
        const calls = racers.map((race) => invoke(owner, {
          ...race, runId, ready: (pid) => pids.push(pid),
        }));
        while (pids.length < 2) await new Promise((resolve) => setTimeout(resolve, 10));
        let waiters = 0;
        for (let i = 0; i < 100 && waiters < 2; i += 1) {
          waiters = (await rootQuery(`select count(*)::int n from pg_stat_activity
              where pid=any($1::int[]) and wait_event_type='Lock'
                and query like 'select clara.evaluate_metric_v1%'`, [pids])).rows[0].n;
          if (waiters < 2) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(waiters, 2,
          "both exact public-session PIDs contend on the evaluator's firm/run advisory lock");
        return calls;
      });
      const settled = await Promise.allSettled(hold);
      assert.deepEqual(settled.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
      const winner = settled.find((result) => result.status === "fulfilled").value;
      const refusal = settled.find((result) => result.status === "rejected").reason;
      assert.ok(winner.receipt.cell_id ?? winner.receipt.id,
        "one complete public cell wins the serialized boundary");
      assert.equal(refusal.code, "CLR10");
      assert.deepEqual(errorDetail(refusal), {
        reason: "cost_exceeded", class: "cells_per_run", limit: 5000,
      });
      assert.equal((await count()).rows[0].n, 5000);
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.metric_evaluation_contexts where firm_id=$1 and run_id=$2",
        [context.firm_id, runId],
      )).rows[0].n, beforeContexts, "the race mints no second context: the run already owned its one firm-wide context");
      const winningRace = racers.find((race) => race.tag === winner.tag);
      const losingRace = racers.find((race) => race.tag === refusal.raceTag);
      assert.equal((await rootQuery(
        "select id from clara.metric_evaluation_contexts where firm_id=$1 and run_id=$2",
        [context.firm_id, runId],
      )).rows[0].id, context.id, "the surviving context is still the seed's, unchanged by the race");
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.metric_cells where firm_id=$1 and run_id=$2 and definition_version_id=any($3::uuid[])",
        [context.firm_id, runId, racers.map((race) => race.version)],
      )).rows[0].n, 1, "the losing call leaves no partial or refused cell");
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='evaluate_metric_v1' and op_key=$2",
        [context.firm_id, `${runId}:${winningRace.version}`],
      )).rows[0].n, 1, "the winner leaves its exact operation receipt");
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='evaluate_metric_v1' and op_key=$2",
        [context.firm_id, `${runId}:${losingRace.version}`],
      )).rows[0].n, 0, "the loser leaves no operation receipt");
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='evaluate_metric_v1' and op_key like $2",
        [context.firm_id, `${runId}:%`],
      )).rows[0].n, beforeReceipts + 1, "only one raced receipt persists");
      // A30b runs BEFORE the reuse/replay probe below: evaluate_fs_pack_v1 reserves its operation on
      // the run id alone, so the cap boundary is only reachable on this run's FIRST pack call.
      // At the ceiling a NEW definition cannot be evaluated. The boundary emits no 5,001st and no
      // fabricated or 'refused' stand-in cell; the durable evidence is a separate immutable attempt
      // receipt whose four numbers the receipt writer measures for itself after the rollback.
      const capVersion = await approvedDefinition(owner, client, "cap-boundary");
      const capError = await caught(() => evaluateFsPackHuman(owner, { client, definitionVersions: [capVersion],
        periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId }));
      assert.equal(capError?.code, "CLR10", `${capError?.code} ${capError?.message}`);
      assert.deepEqual(errorDetail(capError), { reason: "cost_exceeded", class: "cells_per_run", limit: 5000,
        measured_count: 5001, existing_count: 5000, new_required: 1, requested_count: 1 },
      "the pack refusal carries every number it measured, new_required included");
      assert.deepEqual((await rootQuery(`select
          (select count(*)::int from clara.metric_cells where firm_id=$1 and run_id=$2) cells,
          (select count(*)::int from clara.metric_cells where firm_id=$1 and run_id=$2 and definition_version_id=$3) fabricated,
          (select count(*)::int from clara.metric_cells where firm_id=$1 and run_id=$2 and cell_status='refused') refused`,
      [context.firm_id, runId, capVersion])).rows[0], { cells: 5000, fabricated: 0, refused: 0 },
      "the boundary leaves no 5,001st cell, no cell for the refused definition, and no 'refused' cell standing in for one");
      const attemptKey = `cap-${capVersion}`;
      const capReceipt = await recordMetricAttempt(owner, { client, runId, outcomeClass: "cap_refusal",
        definitionVersions: [capVersion], attemptKey, diagnostics: { observed_sqlstate: capError.code } });
      assert.deepEqual([capReceipt.recorded, capReceipt.outcome_class, capReceipt.sqlstate, capReceipt.existing_cell_count,
        capReceipt.new_required_cell_count, capReceipt.projected_cell_count, capReceipt.cell_limit, capReceipt.configured_statement_timeout],
      [true, "cap_refusal", "CLR10", 5000, 1, 5001, 5000, null],
      "the deterministic cap receipt carries the four DB-measured numbers and no timeout");
      const replayed = await recordMetricAttempt(owner, { client, runId, outcomeClass: "cap_refusal",
        definitionVersions: [capVersion], attemptKey });
      assert.deepEqual([replayed.recorded, replayed.receipt_id], [false, capReceipt.receipt_id],
        "re-recording the same attempt keeps exactly one row");
      const receipts = await attemptReceiptRows(client, runId);
      assert.equal(receipts.length, 1, "the run holds exactly one evaluation-attempt receipt");
      assert.deepEqual([receipts[0].outcome_class, receipts[0].entrypoint, receipts[0].projected_cell_count],
        ["cap_refusal", "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)", 5001]);
      for (const sql of ["update clara.metric_evaluation_attempt_receipts set diagnostics='{}'::jsonb where id=$1",
        "delete from clara.metric_evaluation_attempt_receipts where id=$1"]) {
        const immutable = await expectFnOwnerInsertRefusal(sql, [capReceipt.receipt_id]);
        assert.equal(immutable.code, "CLR08", `${immutable.code} ${immutable.message}`);
      }
      // new_required is MEASURED, not taken from the array's length: a definition this run has
      // already evaluated adds nothing, so an attempt naming only such definitions has no breach to
      // record and is refused at the boundary check rather than minting a false receipt.
      const alreadyEvaluated = await caught(() => recordMetricAttempt(owner, { client, runId,
        outcomeClass: "cap_refusal", definitionVersions: [winningRace.version],
        attemptKey: `cap-collapsed-${randomUUID()}` }));
      assert.equal(alreadyEvaluated?.code, "CLR10", `${alreadyEvaluated?.code} ${alreadyEvaluated?.message}`);
      assert.deepEqual([errorDetail(alreadyEvaluated).class, errorDetail(alreadyEvaluated).new_required,
        errorDetail(alreadyEvaluated).projected_count],
      ["cap_boundary_absent", 0, 5000],
      "an already-evaluated definition collapses out of new_required, so the projection does not breach");
      // The concurrent loser gets the WINNER'S receipt, not a unique violation and never a null.
      const raceKey = `cap-race-${randomUUID()}`;
      const raceArgs = { client, runId, outcomeClass: "cap_refusal", definitionVersions: [capVersion], attemptKey: raceKey };
      const [left, right] = await Promise.all([recordMetricAttempt(owner, raceArgs), recordMetricAttempt(owner, raceArgs)]);
      assert.equal(left.receipt_id, right.receipt_id, "both concurrent recordings name the one durable receipt");
      assert.deepEqual([left.recorded, right.recorded].sort(), [false, true],
        "exactly one recording wrote it; the loser reports the existing row rather than raising 23505");
      assert.equal((await rootQuery(
        "select count(*)::int n from clara.metric_evaluation_attempt_receipts where client_id=$1 and run_id=$2 and attempt_key=$3",
        [client, runId, raceKey])).rows[0].n, 1, "the natural key kept exactly one row under contention");
      const notAtBoundary = await caught(() => recordMetricAttempt(owner, { client, runId: randomUUID(),
        outcomeClass: "cap_refusal", definitionVersions: [capVersion], attemptKey: `cap-absent-${randomUUID()}` }));
      assert.equal(notAtBoundary?.code, "CLR10", `${notAtBoundary?.code} ${notAtBoundary?.message}`);
      assert.equal(errorDetail(notAtBoundary).class, "cap_boundary_absent",
        "a cap receipt cannot be minted for an attempt whose own measured projection sits inside the ceiling");
      const receiptsBeforeReuse = (await attemptReceiptRows(client, runId)).length;
      const boundaryArgs = { client: winningRace.client, definitionVersions: [winningRace.version],
        periodIds: winningRace.periodIds, snapshotId: winningRace.snapshotId, runId };
      const boundaryPack = await evaluateFsPackHuman(owner, boundaryArgs);
      const boundaryReplay = await evaluateFsPackHuman(owner, boundaryArgs);
      assert.deepEqual(boundaryReplay, boundaryPack, "an exact pack replay at 5,000 returns the stored ordered receipt");
      assert.equal(boundaryPack.cells[0].cell_id, winner.receipt.cell_id);
      assert.equal((await count()).rows[0].n, 5000, "pack reuse and replay leave the full run exactly at 5,000 cells");
      // The claim is that the lawful reuse and replay add NOTHING, not that the run holds exactly
      // one receipt — earlier cells in this test record their own legitimately. Compared in scope so
      // it stays true as this phase grows.
      assert.equal((await attemptReceiptRows(client, runId)).length, receiptsBeforeReuse,
        "the lawful reuse and replay add no attempt receipt: a receipt is minted only where a truthful cell could not be");
    },
  );

  // B2 + A30b: the DB-side proof of the 15-second batch-cap seam, now also leaving its honest
  // cancellation receipt -- 57014 is recorded as a cancellation, never as a deterministic cost.
  await t.test("the behavioural timeout cap cancels the public evaluator and records a cancellation receipt", async () => {
    const owner = world.users.alice, cancelled = await assertBehavioralTimeoutCaps(owner);
    const attemptKey = `cancel-${cancelled.runId}`;
    const receipt = await recordMetricAttempt(owner, { client: cancelled.client, runId: cancelled.runId,
      outcomeClass: "cancellation", entrypoint: "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)",
      attemptKey, configuredTimeout: cancelled.configuredTimeout,
      diagnostics: { observed_sqlstate: "57014", cause: "outer 15-second batch cap" } });
    assert.deepEqual([receipt.recorded, receipt.outcome_class, receipt.sqlstate, receipt.configured_statement_timeout,
      receipt.existing_cell_count, receipt.new_required_cell_count, receipt.projected_cell_count, receipt.cell_limit],
    [true, "cancellation", "57014", "15s", null, null, null, null],
    "a 57014 is recorded as a cancellation carrying its configured timeout, never as a deterministic cost_exceeded");
    const rows = await attemptReceiptRows(cancelled.client, cancelled.runId);
    assert.equal(rows.length, 1, "the cancelled run holds exactly one attempt receipt");
    assert.deepEqual([rows[0].outcome_class, rows[0].diagnostics.cancellation_is_not_cost_exceeded,
      rows[0].diagnostics.configured_statement_timeout_source, rows[0].diagnostics.observed_sqlstate],
    ["cancellation", true, "caller_reported", "57014"],
    "the receipt records the timeout as caller-reported rather than passing it off as a DB measurement");
    const again = await recordMetricAttempt(owner, { client: cancelled.client, runId: cancelled.runId,
      outcomeClass: "cancellation", entrypoint: "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)",
      attemptKey, configuredTimeout: cancelled.configuredTimeout });
    assert.deepEqual([again.recorded, again.receipt_id, (await attemptReceiptRows(cancelled.client, cancelled.runId)).length],
      [false, receipt.receipt_id, 1], "the cancellation receipt is idempotent on its natural key");
    const untimed = await caught(() => recordMetricAttempt(owner, { client: cancelled.client, runId: cancelled.runId,
      outcomeClass: "cancellation", attemptKey: `cancel-untimed-${randomUUID()}` }));
    assert.equal(untimed?.code, "CLR10", `${untimed?.code} ${untimed?.message}`);
    assert.equal(errorDetail(untimed).class, "configured_statement_timeout",
      "a cancellation receipt without its configured timeout is refused rather than guessed");
  });
}
