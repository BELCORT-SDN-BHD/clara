import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, withActor, ROLES, buildWorld, freshDeltaClient, pastMonthStart, addMonths,
  upsertAccountClassed, EXPN, createAccountSet, proposeMetricDefinition, approveMetricDefinition,
  mintPeriodWithMovement, evaluateMetricHuman, assessMetricIndependentHuman,
  cellRow, caught, reasonOf, errorDetail, expectFnOwnerActionRefusal, measure, metricAst,
} from "./delta-fixtures.mjs";

let world;

async function approvedDefinition(owner, options) {
  const version = await proposeMetricDefinition(owner, options);
  await approveMetricDefinition(owner, version);
  return version;
}

async function evaluate(owner, { client, version, period, snapshotId, runId = randomUUID() }) {
  return cellRow(await evaluateMetricHuman(owner, {
    client, definitionVersion: version, periodIds: [period.id], snapshotId, runId,
  }));
}

async function reasonKey(cell) {
  if (!cell.na_reason_version_id) return null;
  return (await rootQuery(
    "select reason_key from clara.metric_na_reason_versions where id=$1",
    [cell.na_reason_version_id],
  )).rows[0].reason_key;
}

async function assertE6(owner, cell, expectedStatus, expectedReason = null) {
  await assessMetricIndependentHuman(owner, { cell: cell.id });
  const assessment = (await rootQuery(
    `select matches,observed_status,observed_reason_key,observed_numerator,observed_denominator,details
       from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1`,
    [cell.id],
  )).rows[0];
  assert.deepEqual([assessment.matches, assessment.observed_status, assessment.observed_reason_key],
    [true, expectedStatus, expectedReason]);
  if (expectedStatus !== "ok") assert.deepEqual([assessment.observed_numerator, assessment.observed_denominator], [null, null]);
  return assessment;
}

function numericPrefix() {
  return String(600 + Number.parseInt(
    randomUUID().replace(/\D/g, "").slice(0, 3).padEnd(3, "0"), 10,
  ) % 300);
}

export async function registerAccountSetAcceptancePhase(t) {
  world = world ?? await buildWorld();

  await t.test("exactly 512 frozen members evaluate the right sum and E6 reproduces it", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "set-512-eval"), prefix = numericPrefix();
    for (let i = 0; i < 512; i += 1) await upsertAccountClassed(owner, {
      client, code: `${prefix}${String(i).padStart(3, "0")}`, name: `Delta evaluated bound ${i}`, type: "expense",
    });
    const selector = { code_from: `${prefix}000`, code_to: `${prefix}511` };
    const set = await createAccountSet(owner, { client, key: "bound512_eval", selector });
    const setId = set.account_set_version_id ?? set.version_id;
    const monthStart = await pastMonthStart(3), expected = 731;
    const fx = await mintPeriodWithMovement(owner, {
      client, monthStart, debit: `${prefix}000`, credit: EXPN, cents: 731,
    });
    const version = await approvedDefinition(owner, {
      client, key: `bound512_eval_${randomUUID()}`, unit: "money", resultScale: 0,
      ast: metricAst({ root: measure({ set: "bound512_eval" }), unit: "money", resultScale: 0 }),
    });
    const cell = await evaluate(owner, { client, version, period: fx.period, snapshotId: fx.snapshotId });
    assert.deepEqual([cell.cell_status, String(cell.exact_numerator), String(cell.exact_denominator)],
      ["ok", String(expected), "1"]);
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2",
      [cell.id, setId],
    )).rows[0].n, 1);
    const assessment = await assertE6(owner, cell, "ok");
    assert.deepEqual([String(assessment.observed_numerator), String(assessment.observed_denominator)], [String(expected), "1"]);
  });

  await t.test("a later 513-member version persists expansion refusal, exact provenance, and E6 parity", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "set-513-remint"), prefix = numericPrefix();
    for (let i = 0; i < 513; i += 1) await upsertAccountClassed(owner, {
      client, code: `${prefix}${String(i).padStart(3, "0")}`, name: `Delta remint bound ${i}`, type: "expense",
    });
    const oldStart = await pastMonthStart(5), laterStart = addMonths(oldStart, 1);
    const oldSet = await createAccountSet(owner, {
      client, key: "bound_remint", selector: { code_from: `${prefix}000`, code_to: `${prefix}511` }, effectiveFrom: oldStart,
    });
    const oldSetId = oldSet.account_set_version_id ?? oldSet.version_id;
    const version = await approvedDefinition(owner, {
      client, key: `bound_remint_${randomUUID()}`, unit: "money", resultScale: 0, appliesFrom: oldStart,
      ast: metricAst({ root: measure({ set: "bound_remint" }), unit: "money", resultScale: 0 }),
    });
    const oldFx = await mintPeriodWithMovement(owner, { client, monthStart: oldStart, debit: `${prefix}000`, credit: EXPN, cents: 17 });
    const oldCell = await evaluate(owner, { client, version, period: oldFx.period, snapshotId: oldFx.snapshotId });
    assert.equal(oldCell.cell_status, "ok");
    const wideSet = await createAccountSet(owner, {
      client, key: "bound_remint", selector: { code_from: `${prefix}000`, code_to: `${prefix}512` }, effectiveFrom: laterStart,
    });
    const wideSetId = wideSet.account_set_version_id ?? wideSet.version_id;
    const wideFx = await mintPeriodWithMovement(owner, { client, monthStart: laterStart, debit: `${prefix}512`, credit: EXPN, cents: 19 });
    const wideCell = await evaluate(owner, { client, version, period: wideFx.period, snapshotId: wideFx.snapshotId });
    assert.deepEqual([wideCell.cell_status, await reasonKey(wideCell), wideCell.exact_numerator, wideCell.exact_denominator],
      ["refused", "account_set_expansion", null, null]);
    assert.equal(wideCell.inputs.account_set_resolution.set_key, "bound_remint");
    assert.equal(wideCell.inputs.account_set_resolution.version_id, wideSetId);
    assert.deepEqual([
      Number(wideCell.inputs.account_set_resolution.measured_count),
      Number(wideCell.inputs.account_set_resolution.ordinal_mismatch_count),
      Number(wideCell.inputs.account_set_resolution.stored_count),
      wideCell.inputs.account_set_resolution.state,
      String(wideCell.inputs.account_set_resolution.effective_from).slice(0, 10),
      wideCell.inputs.account_set_resolution.effective_to,
    ], [513, 0, 513, "published", laterStart, null]);
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2",
      [wideCell.id, wideSetId],
    )).rows[0].n, 1);
    await assertE6(owner, wideCell, "refused", "account_set_expansion");
    const replay = await evaluate(owner, { client, version, period: oldFx.period, snapshotId: oldFx.snapshotId });
    assert.equal(replay.cell_status, "ok");
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2",
      [replay.id, oldSetId],
    )).rows[0].n, 1, "the historical period resolves the superseded 512-member version");
  });

  await t.test("the same live no-fact account is absent by default and exact zero only by explicit policy", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "same-account-zero"), code = `8${randomUUID().replace(/\D/g, "").slice(0, 7).padEnd(7, "0")}`;
    await upsertAccountClassed(owner, { client, code, name: "Delta same no-fact account", type: "expense" });
    const absentSet = await createAccountSet(owner, { client, key: "same_absent", selector: { account_codes: [code] } });
    const zeroSet = await createAccountSet(owner, { client, key: "same_zero", selector: { account_codes: [code] }, zeroWhenNoRows: true });
    const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(3) });
    const frozen = (await rootQuery(
      `select s.set_key,v.zero_when_no_rows,v.frozen_member_count,count(c.journal_line_id)::int facts
         from clara.account_sets s join clara.account_set_versions v on v.account_set_id=s.id
         join clara.account_set_version_members m on m.account_set_version_id=v.id
         left join clara.metric_input_snapshot_contributions c on c.snapshot_id=$1 and c.account_id=m.account_id
        where v.id=any($2::uuid[]) group by s.set_key,v.id order by s.set_key`,
      [fx.snapshotId, [absentSet.account_set_version_id, zeroSet.account_set_version_id]],
    )).rows;
    assert.deepEqual(frozen, [
      { set_key: "same_absent", zero_when_no_rows: false, frozen_member_count: 1, facts: 0 },
      { set_key: "same_zero", zero_when_no_rows: true, frozen_member_count: 1, facts: 0 },
    ]);
    const cells = [];
    for (const [key, status, reason, numerator, denominator] of [
      ["same_absent", "absent", "absent", null, null], ["same_zero", "ok", null, "0", "1"],
    ]) {
      const version = await approvedDefinition(owner, {
        client, key: `${key}_${randomUUID()}`, unit: "money", resultScale: 0,
        ast: metricAst({ root: measure({ set: key }), unit: "money", resultScale: 0 }),
      });
      const cell = await evaluate(owner, { client, version, period: fx.period, snapshotId: fx.snapshotId });
      assert.deepEqual([cell.cell_status, await reasonKey(cell), cell.exact_numerator == null ? null : String(cell.exact_numerator), cell.exact_denominator == null ? null : String(cell.exact_denominator)],
        [status, reason, numerator, denominator]);
      await assertE6(owner, cell, status, reason); cells.push(cell);
    }
    assert.notEqual(cells[0].id, cells[1].id);
  });

  await t.test("account-set freeze and lifecycle walls reject sealed or incoherent corpora", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "set-corruption"), start = await pastMonthStart(4);
    const code = `8${randomUUID().replace(/\D/g, "").slice(0, 7).padEnd(7, "0")}`;
    await upsertAccountClassed(owner, { client, code, name: "Delta freeze wall", type: "expense" });
    const set = await createAccountSet(owner, { client, key: "freeze_wall", selector: { account_codes: [code] }, effectiveFrom: start });
    const setId = set.account_set_version_id ?? set.version_id;
    const extraCode = `8${randomUUID().replace(/\D/g, "").slice(0, 7).padEnd(7, "1")}`;
    await upsertAccountClassed(owner, { client, code: extraCode, name: "Delta sealed extra", type: "expense" });
    const extraId = (await rootQuery("select account_id from clara.coa_accounts where client_id=$1 and account_code=$2", [client, extraCode])).rows[0].account_id;
    const sealed = await expectFnOwnerActionRefusal(async (db) => {
      const row = (await db.query("select firm_id,client_id from clara.account_set_versions where id=$1", [setId])).rows[0];
      await db.query("insert into clara.account_set_version_members(account_set_version_id,firm_id,client_id,account_id,ordinal)values($1,$2,$3,$4,1)", [setId, row.firm_id, row.client_id, extraId]);
    });
    assert.equal(sealed.code, "CLR08"); assert.match(sealed.message, /sealed after version creation/i);

    const identity = (await rootQuery("select firm_id,account_id from clara.coa_accounts where client_id=$1 and account_code=$2", [client, code])).rows[0];
    for (const [tag, storedCount, ordinal] of [["count", 2, 0], ["ordinal", 1, 7]]) {
      const error = await caught(() => withActor({ transaction: true }, async (db) => {
        await db.query(`set role ${ROLES.fnOwner}`); const accountSet = randomUUID(), accountVersion = randomUUID(), selector = { account_codes: [code] };
        await db.query("insert into clara.account_sets(id,firm_id,client_id,set_key,title,created_by)values($1,$2,$3,$4,$4,$5)",
          [accountSet, identity.firm_id, client, `corrupt_${tag}_${randomUUID()}`, owner]);
        await db.query(`insert into clara.account_set_versions(id,firm_id,client_id,account_set_id,revision,selector,zero_when_no_rows,frozen_member_count,frozen_members_sha256,content_sha256,state,effective_from,created_by)
          values($1,$2,$3,$4,1,$5,false,$6,clara._hash(to_jsonb(array[$7]::uuid[])),clara._hash(jsonb_build_object('schema','clara.account-set-version/v1','selector',$5::jsonb,'zero_when_no_rows',false,'members',array[$7]::uuid[])),'published',$8,$9)`,
        [accountVersion, identity.firm_id, client, accountSet, selector, storedCount, identity.account_id, start, owner]);
        await db.query("insert into clara.account_set_version_members(account_set_version_id,firm_id,client_id,account_id,ordinal)values($1,$2,$3,$4,$5)",
          [accountVersion, identity.firm_id, client, identity.account_id, ordinal]);
        await db.query("select clara.verify_account_set_version_freeze($1)", [accountVersion]);
      }));
      assert.equal(error?.code, "CLR11", `${tag}: ${error?.message} ${error?.detail ?? ""}`);
      assert.match(`${error?.message} ${error?.detail ?? ""}`, /frozen corpus|reconstruct|account.?set.*integrity/i, tag);
    }

    const overlapOp = `delta-overlap-${randomUUID()}`, overlapRefusal = await caught(() => createAccountSet(owner, { client, key: "freeze_wall", selector: { account_codes: [code] }, effectiveFrom: start, opKey: overlapOp })); assert.equal(overlapRefusal?.code, "CLR10"); assert.equal(reasonOf(overlapRefusal), "effective_window_overlap"); assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='create_account_set_v1' and op_key=$1", [overlapOp])).rows[0].n, 0);
    const overlap = await caught(() => withActor({ transaction: true }, async (db) => {
      await db.query(`set role ${ROLES.fnOwner}`); await db.query("set constraints clara.t_account_set_version_integrity deferred");
      const base = (await db.query("select * from clara.account_set_versions where id=$1", [setId])).rows[0], duplicate = randomUUID(), end = addMonths(start, 2);
      await db.query(`insert into clara.account_set_versions(id,firm_id,client_id,account_set_id,revision,selector,zero_when_no_rows,frozen_member_count,frozen_members_sha256,content_sha256,state,effective_from,effective_to,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'superseded',$11,$12,$13)`,
      [duplicate, base.firm_id, base.client_id, base.account_set_id, Number(base.revision) + 1, base.selector,
        base.zero_when_no_rows, base.frozen_member_count, base.frozen_members_sha256, base.content_sha256, start, end, owner]);
      await db.query(`insert into clara.account_set_version_members(account_set_version_id,firm_id,client_id,account_id,ordinal)
        select $1,firm_id,client_id,account_id,ordinal from clara.account_set_version_members where account_set_version_id=$2`, [duplicate, setId]);
      await db.query("set constraints clara.t_account_set_version_integrity immediate");
    }));
    assert.equal(overlap?.code, "CLR11"); assert.equal(reasonOf(overlap), "effective_version_ambiguity");
  });

  // i2: an EXPLICIT account_ids/account_codes element is an assertion that the account exists; a
  // selector that quietly drops a miss is the wrong-answer-that-looks-right class, so every element
  // must resolve to exactly one ACTIVE account of the target client at creation AND at evaluation.
  await t.test("an explicit account id or code resolves to exactly one active client account or refuses by name", async () => {
    const owner = world.users.alice, client = await freshDeltaClient(owner, "selector-exactness");
    const other = await freshDeltaClient(owner, "selector-exactness-foreign");
    const foreign = (await rootQuery("select account_id from clara.coa_accounts where client_id=$1 order by account_code limit 1", [other])).rows[0];
    assert.ok(foreign?.account_id, "the foreign same-firm client positively owns a chart account");
    const code = `8${randomUUID().replace(/\D/g, "").slice(0, 7).padEnd(7, "2")}`;
    await upsertAccountClassed(owner, { client, code, name: "Delta explicit selector target", type: "expense" });
    const live = (await rootQuery("select account_id,is_active from clara.coa_accounts where client_id=$1 and account_code=$2", [client, code])).rows[0];
    assert.equal(live.is_active, true, "the explicit target is positively active before the happy path is measured");
    for (const [tag, selector] of [["by_code", { account_codes: [code] }], ["by_id", { account_ids: [live.account_id] }]]) {
      const receipt = await createAccountSet(owner, { client, key: `explicit_${tag}_${randomUUID()}`, selector });
      assert.deepEqual((await rootQuery(`select v.frozen_member_count,count(m.account_id)::int members,min(m.account_id::text) member
          from clara.account_set_versions v join clara.account_set_version_members m on m.account_set_version_id=v.id
         where v.id=$1 group by v.frozen_member_count`, [receipt.account_set_version_id ?? receipt.version_id])).rows[0],
      { frozen_member_count: 1, members: 1, member: live.account_id }, `${tag} freezes the exact resolved account`);
    }
    const retireKey = `explicit_retire_${randomUUID()}`;
    await createAccountSet(owner, { client, key: retireKey, selector: { account_codes: [code] } });
    const version = await approvedDefinition(owner, {
      client, key: `explicit_retire_metric_${randomUUID()}`, unit: "money", resultScale: 0,
      ast: metricAst({ root: measure({ set: retireKey }), unit: "money", resultScale: 0 }),
    });
    const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(3) });
    const before = await evaluate(owner, { client, version, period: fx.period, snapshotId: fx.snapshotId });
    assert.deepEqual([before.cell_status, await reasonKey(before)], ["absent", "absent"],
      "the live explicit set evaluates to a truthful absence while its account is active");
    await withActor({ role: ROLES.fnOwner }, (db) => db.query(
      "update clara.coa_accounts set is_active=false where client_id=$1 and account_code=$2", [client, code]));
    assert.equal((await rootQuery("select is_active from clara.coa_accounts where client_id=$1 and account_code=$2", [client, code])).rows[0].is_active,
      false, "the explicit target is positively inactive before the evaluation refusal is measured");
    const runId = randomUUID();
    const evalError = await caught(() => evaluateMetricHuman(owner, {
      client, definitionVersion: version, periodIds: [fx.period.id], snapshotId: fx.snapshotId, runId,
    }));
    assert.equal(evalError?.code, "CLR10", `${evalError?.code} ${evalError?.message}`);
    assert.equal(reasonOf(evalError), "selector_element_unresolved", `${evalError?.detail}`);
    assert.deepEqual(errorDetail(evalError).unresolved.map((row) => [row.field, row.value, row.matched_active_accounts]),
      [["account_codes", code, 0]], "the evaluation names the exact element that stopped resolving");
    assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where client_id=$1 and run_id=$2", [client, runId])).rows[0].n,
      0, "the fail-closed evaluation mints no cell and no silently narrowed number");
    for (const [tag, field, value] of [
      ["nonexistent_code", "account_codes", `9${randomUUID().replace(/\D/g, "").slice(0, 6).padEnd(6, "3")}`],
      ["inactive_account", "account_codes", code],
      ["wrong_client_account_id", "account_ids", foreign.account_id],
      ["malformed_account_id", "account_ids", "not-a-uuid"],
    ]) {
      const key = `explicit_${tag}_${randomUUID()}`, opKey = `delta-explicit-${randomUUID()}`;
      const error = await caught(() => createAccountSet(owner, { client, key, selector: { [field]: [value] }, opKey }));
      assert.equal(error?.code, "CLR10", `${tag}: ${error?.code} ${error?.message}`);
      assert.equal(reasonOf(error), "selector_element_unresolved", `${tag}: ${error?.detail}`);
      assert.deepEqual(errorDetail(error).unresolved.map((row) => [row.field, row.value, row.matched_active_accounts]),
        [[field, String(value), 0]], `${tag} names its exact offending element`);
      assert.deepEqual((await rootQuery(`select count(distinct s.id)::int sets,count(v.id)::int versions
          from clara.account_sets s left join clara.account_set_versions v on v.account_set_id=s.id
         where s.client_id=$1 and s.set_key=$2`, [client, key])).rows[0], { sets: 0, versions: 0 }, `${tag} leaves no set`);
      assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='create_account_set_v1' and op_key=$1", [opKey])).rows[0].n,
        0, `${tag} leaves no operation receipt`);
    }
    assert.equal((await rootQuery(`select count(*)::int n from clara.account_set_version_members m
        join clara.account_set_versions v on v.id=m.account_set_version_id where v.client_id=$1 and m.account_id=$2`,
    [client, foreign.account_id])).rows[0].n, 0, "no foreign-client account ever entered a frozen membership");
  });
}
