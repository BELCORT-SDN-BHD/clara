import assert from "node:assert/strict";import { randomUUID } from "node:crypto";import {
  rootQuery, withActor, ROLES, buildWorld, requireWaveEDelta, caught, errorDetail, reasonOf,
  freshDeltaClient, pastMonthStart, addMonths, plainEntry, upsertAccountClassed, BANK1, REVN, EXPN,
  AP1, AR1, RE1, birthCounterparty, openArItem57, allocateReceipt57, draftEntryV3, approveEntry, freshResolution,
  mintPeriodWithMovement, mintMonthPeriod, reportingPeriodRows, proposeFY, openFY, verifiedDocument, reverseEntryGoverned, retireFilingGoverned,
  createStandardSets, createAccountSet, assertCountSchemaRefusals, assertStoredDeclarationMismatchRefusals, assertSettledSignedCount, assertContextOrderRefusal, postCounterpartyEntry, proposeMetricDefinition, approveMetricDefinition,
  mintMetricInput, evaluateMetricHuman, assessMetricIndependentHuman, cellRow, expectFnOwnerInsertRefusal, expectFnOwnerActionRefusal, measure, constant, metricAst,
} from "./delta-fixtures.mjs";
let world; async function approvedDefinition(owner, options) {
  const version = await proposeMetricDefinition(owner, options);
  await approveMetricDefinition(owner, version);
  return version;
}async function evaluate(owner, { client, version, periods, snapshotId, runId }) { return cellRow(await evaluateMetricHuman(owner, {
  client, definitionVersion: version, periodIds: periods.map((period) => period.id), snapshotId, runId,
})); }
async function reasonKey(cell) { return cell.na_reason_version_id ? (await rootQuery("select reason_key from clara.metric_na_reason_versions where id=$1", [cell.na_reason_version_id])).rows[0].reason_key : null; }
function gcd(left, right) { let a = Math.abs(left), b = Math.abs(right); while (b !== 0) [a, b] = [b, a % b]; return a; }
async function expectProposalRefusal(owner, options, expectedReason, namedFix, expectedDetail = {}) { const key = options.key, opKey = `delta-invalid-${randomUUID()}`, err = await caught(() => proposeMetricDefinition(owner, { ...options, opKey })), detail = errorDetail(err); assert.equal(err?.code, "CLR10"); assert.equal(reasonOf(err), expectedReason, `${err?.code} ${err?.message} ${err?.detail}`); assert.match(detail.fix ?? "", namedFix); for (const [detailKey, value] of Object.entries(expectedDetail)) assert.equal(detail[detailKey], value, detailKey); assert.deepEqual((await rootQuery(`select count(distinct d.id)::int definitions,count(v.id)::int versions from clara.metric_definitions d left join clara.metric_definition_versions v on v.definition_id=d.id where d.firm_id=(select firm_id from clara.clients where id=$1)and d.definition_key=$2`, [options.client, key])).rows[0], { definitions: 0, versions: 0 }); assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='propose_metric_definition' and op_key=$1", [opKey])).rows[0].n, 0); }
async function expectApprovalRefusal(owner, options, expectedReason, namedFix, expectedDetail = {}) { const proposalOp = `delta-proposal-${randomUUID()}`, approvalOp = `delta-approval-${randomUUID()}`;
  const version = await proposeMetricDefinition(owner, { ...options, opKey: proposalOp }); const err = await caught(() => approveMetricDefinition(owner, version, { opKey: approvalOp })), detail = errorDetail(err);
  assert.equal(err?.code, "CLR10"); assert.equal(reasonOf(err), expectedReason, `${err?.code} ${err?.message} ${err?.detail}`); assert.match(detail.fix ?? "", namedFix); for (const [key, value] of Object.entries(expectedDetail)) assert.equal(detail[key], value, key);
  assert.deepEqual((await rootQuery("select state,approved_by,approved_at,approved_formula_sha256 from clara.metric_definition_versions where id=$1", [version])).rows[0], { state: "draft", approved_by: null, approved_at: null, approved_formula_sha256: null }, "approval refusal preserves the durable draft only");
  assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='propose_metric_definition' and op_key=$1 and result is not null", [proposalOp])).rows[0].n, 1); assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='approve_metric_definition' and op_key=$1", [approvalOp])).rows[0].n, 0); }
export async function registerAlgebraPhase(t) { await requireWaveEDelta(); world = await buildWorld();
await t.test("type, scope, and static-cost violations persist drafts then refuse approval with named fixes", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "validation"); await createStandardSets(owner, client); const cases = [
    ["stock_over_flow", /average\(\.\.\.\).*days_in_period/i, metricAst({ root: { node: "divide", num: measure({ set: "ar", aspect: "closing_balance" }), den: measure({ set: "revenue" }) } })],
    ["dimension_mismatch", /matching operands/i, metricAst({ unit: "money", root: { node: "sum", terms: [measure({ set: "revenue" }), { node: "divide", num: measure({ set: "revenue" }), den: measure({ set: "revenue" }) }] } })],
    ["scope_mismatch", /single client entity/i, metricAst({ unit: "money", root: { node: "sum", terms: [measure({ set: "revenue" }), measure({ set: "revenue", entity: randomUUID() })] } })],
    ["scope_mismatch", /closed immutable-fact source and client scope/i, metricAst({ unit: "count", resultScale: 0, root: { node: "count", source: "open_items", scope: { period: "$P0", entity: randomUUID(), basis: "accrual" } } })],
  ];
  for (const [reason, fix, ast] of cases) await expectApprovalRefusal(owner, { client, key: `${reason}_${randomUUID()}`, unit: ast.unit, temporality: ast.temporality, resultScale: ast.result_scale, ast }, reason, fix);
  const admittedDepth = Array.from({ length: 11 }).reduce((node) => ({ node: "lag", periods: 1, of: node }), measure({ set: "revenue" })), admitted = await proposeMetricDefinition(owner, { client, key: `depth12_${randomUUID()}`, unit: "money", ast: metricAst({ root: admittedDepth, unit: "money" }) }); await approveMetricDefinition(owner, admitted);
  const proposalDepth24 = Array.from({ length: 23 }).reduce((node) => ({ node: "lag", periods: 1, of: node }), measure({ set: "revenue" })), proposal24Key = `proposal_depth24_${randomUUID()}`, proposal24Op = `delta-depth24-${randomUUID()}`, structural = await proposeMetricDefinition(owner, { client, key: proposal24Key, unit: "money", ast: metricAst({ root: proposalDepth24, unit: "money" }), opKey: proposal24Op }); assert.deepEqual((await rootQuery(`select v.id,v.state,d.definition_key,(select count(*)::int from clara.op_receipts where fn='propose_metric_definition' and op_key=$2) receipts from clara.metric_definition_versions v join clara.metric_definitions d on d.id=v.definition_id where v.id=$1`, [structural, proposal24Op])).rows[0], { id: structural, state: "draft", definition_key: proposal24Key, receipts: 1 }, "proposal admits and durably receipts exactly 24 structural levels before approval semantics run"); await expectProposalRefusal(owner, { client, key: `proposal_depth25_${randomUUID()}`, unit: "money", ast: metricAst({ root: { node: "lag", periods: 1, of: proposalDepth24 }, unit: "money" }) }, "structural_safety_ceiling", /^reduce metric nesting below the proposal safety depth of 24 levels$/i, { class: "depth", limit: 24 });
  const costTrees = {
    depth: [Array.from({ length: 12 }).reduce((node) => ({ node: "lag", periods: 1, of: node }), measure({ set: "revenue" })), /reduce metric nesting to at most 12 levels/i],
    nodes: [{ node: "sum", terms: Array.from({ length: 65 }, () => measure({ set: "revenue" })) }, /reduce the AST to at most 64 nodes/i],
    leaves: [{ node: "sum", terms: Array.from({ length: 33 }, (_, index) => measure({ set: index % 2 ? "revenue" : "expense" })) }, /reduce the AST to at most 32 measure leaves/i],
    lag: [{ node: "lag", periods: 25, of: measure({ set: "revenue" }) }, /reduce the largest lag to at most 24 periods/i],
  }; for (const [costClass, [root, fix]] of Object.entries(costTrees)) await expectApprovalRefusal(owner, { client, key: `cost_${costClass}_${randomUUID()}`, unit: "money", temporality: "flow", resultScale: 4, ast: metricAst({ root, unit: "money" }) }, "cost_exceeded", fix);
});await t.test("frozen account-set expansion admits 512 and refuses measured 513 at approval", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "set-bound"), prefix = String(600 + Number.parseInt(randomUUID().replace(/\D/g, "").slice(0, 3).padEnd(3, "0"), 10) % 300); for (let i = 0; i < 513; i += 1) await upsertAccountClassed(owner, { client, code: `${prefix}${String(i).padStart(3, "0")}`, name: `Delta bound ${i}`, type: "expense" });
  const selector = (n) => ({ code_from: `${prefix}000`, code_to: `${prefix}${String(n - 1).padStart(3, "0")}` }), set512 = await createAccountSet(owner, { client, key: "bound512", selector: selector(512) }), id512 = set512.account_set_version_id ?? set512.version_id;
  const freeze = (await rootQuery(`select v.frozen_member_count,encode(v.frozen_members_sha256,'hex') frozen_hash,encode(clara._hash(to_jsonb(array_agg(m.account_id order by m.ordinal))),'hex') measured_hash,count(*)::int measured_count,array_agg(m.account_id order by m.ordinal)=array_agg(m.account_id order by m.account_id) ordered from clara.account_set_versions v join clara.account_set_version_members m on m.account_set_version_id=v.id where v.id=$1 group by v.id`, [id512])).rows[0]; assert.deepEqual([freeze.frozen_member_count, freeze.measured_count, freeze.frozen_hash, freeze.measured_hash, freeze.ordered], [512, 512, freeze.frozen_hash, freeze.frozen_hash, true]);
  const ast512 = metricAst({ root: measure({ set: "bound512" }), unit: "money" }), approved512 = await proposeMetricDefinition(owner, { client, key: `bound512_${randomUUID()}`, unit: "money", ast: ast512 }); await approveMetricDefinition(owner, approved512); const monthStart = await pastMonthStart(8); await plainEntry(owner, { client, debit: `${prefix}000`, credit: BANK1, cents: 512, postingDate: `${monthStart.slice(0, 8)}10`, memo: "delta 512-member right answer" }); const { period } = await mintMonthPeriod(owner, { client, monthStart }), { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] }), cell512 = await evaluate(owner, { client, version: approved512, periods: [period], snapshotId }); assert.deepEqual([cell512.cell_status, String(cell512.exact_numerator), String(cell512.exact_denominator)], ["ok", "512", "1"]); assert.equal((await rootQuery("select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2", [cell512.id, id512])).rows[0].n, 1); await assessMetricIndependentHuman(owner, { cell: cell512.id }); assert.equal((await rootQuery("select matches from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [cell512.id])).rows[0].matches, true); const lateAccount = (await rootQuery("select account_id,firm_id from clara.coa_accounts where client_id=$1 and account_code=$2", [client, `${prefix}512`])).rows[0], lateInsert = await expectFnOwnerInsertRefusal("insert into clara.account_set_version_members(account_set_version_id,firm_id,client_id,account_id,ordinal) values($1,$2,$3,$4,512)", [id512, lateAccount.firm_id, client, lateAccount.account_id]); assert.equal(lateInsert.code, "CLR08"); assert.match(lateInsert.message, /sealed after version creation/i); assert.equal((await rootQuery("select count(*)::int n from clara.account_set_version_members where account_set_version_id=$1", [id512])).rows[0].n, 512);
  const set513 = await createAccountSet(owner, { client, key: "bound513", selector: selector(513) }), id513 = set513.account_set_version_id ?? set513.version_id; await expectApprovalRefusal(owner, { client, key: `bound513_${randomUUID()}`, unit: "money", ast: metricAst({ root: measure({ set: "bound513" }), unit: "money" }) }, "cost_exceeded", /^narrow the account-set selector and mint a new version with at most 512 frozen members$/i, { class: "account_set_expansion", limit: 512, measured_count: 513, set_key: "bound513", version_id: id513 }); const corrupt = await expectFnOwnerActionRefusal(async (db) => { const base = (await db.query("select * from clara.account_set_versions where id=$1", [id513])).rows[0], badId = randomUUID(); await db.query("set constraints clara.t_account_set_version_integrity deferred"); await db.query(`insert into clara.account_set_versions(id,firm_id,client_id,account_set_id,revision,selector,zero_when_no_rows,frozen_member_count,frozen_members_sha256,content_sha256,state,effective_from,created_by) values($1,$2,$3,$4,99,$5,false,514,$6,$7,'superseded','2019-01-01',$8)`, [badId, base.firm_id, client, base.account_set_id, base.selector, base.frozen_members_sha256, base.content_sha256, owner]); await db.query("set constraints clara.t_account_set_version_integrity immediate"); }); assert.equal(corrupt.code, "CLR11"); assert.equal(reasonOf(corrupt), "account_set_integrity_mismatch");
});await t.test("stock-over-flow repair averages exact stock and multiplies by inclusive days", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "stock-flow-fix"); await createStandardSets(owner, client); const monthStart = await pastMonthStart(2), postingDate = `${monthStart.slice(0, 8)}10`; await postCounterpartyEntry(owner, { client, counterparty: await birthCounterparty(owner, { client, name: `Delta stock customer ${randomUUID().slice(0, 8)}`, kind: "customer" }), debit: AR1, credit: REVN, cents: 10_000, postingDate, kind: "customer", memo: "delta stock numerator" }); await plainEntry(owner, { client, debit: BANK1, credit: REVN, cents: 90_000, postingDate, memo: "delta flow denominator" }); const { period } = await mintMonthPeriod(owner, { client, monthStart }), { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] }), days = Math.round((new Date(period.period_end) - new Date(period.period_start)) / 86_400_000) + 1;
  const ast = metricAst({ unit: "days", resultScale: 4, root: { node: "multiply", left: { node: "divide", num: { node: "average", of: measure({ set: "ar", aspect: "closing_balance" }) }, den: measure({ set: "revenue" }) }, right: { node: "days_in_period" } } }), version = await approvedDefinition(owner, { client, key: `stock_flow_fix_${randomUUID()}`, unit: "days", resultScale: 4, ast }), cell = await evaluate(owner, { client, version, periods: [period], snapshotId }), divisor = gcd(days, 10); assert.equal(cell.cell_status, "ok"); assert.deepEqual([String(cell.exact_numerator), String(cell.exact_denominator)], [String(days / divisor), String(10 / divisor)]); await assessMetricIndependentHuman(owner, { cell: cell.id }); assert.equal((await rootQuery("select matches from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [cell.id])).rows[0].matches, true);
});await t.test("count requires source and scope", async () => assertCountSchemaRefusals(world.users.alice,
  await freshDeltaClient(world.users.alice, "count-schema")));
await t.test("stored declarations match the AST", async () => assertStoredDeclarationMismatchRefusals(world.users.alice,
  await freshDeltaClient(world.users.alice, "stored-declarations")));
await t.test("lag before first is absent at evaluation; month and FY use exact calendar prior", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "calendar-prior");
  await createStandardSets(owner, client);
  const growth = await approvedDefinition(owner, {
    client, key: `growth_${randomUUID()}`,
    ast: metricAst({ root: {
      node: "percent_change", current: measure({ set: "revenue" }),
      prior: { node: "lag", periods: 1, of: measure({ set: "revenue" }) },
    } }),
  });
  const janStart = await pastMonthStart(10);
  const febStart = addMonths(janStart, 1);
  const marStart = addMonths(janStart, 2);
  const jan = await mintPeriodWithMovement(owner, { client, monthStart: janStart, cents: 100_000 });
  const mar = await mintPeriodWithMovement(owner, { client, monthStart: marStart, cents: 120_000 });
  assert.equal((await reportingPeriodRows(client, "month")).some((row) => row.period_start === febStart), false);
  const janCell = await evaluate(owner, { client, version: growth, periods: [jan.period], snapshotId: jan.snapshotId });
  assert.deepEqual([janCell.cell_status, await reasonKey(janCell)], ["absent", "prior_period_absent"]);
  const marCell = await evaluate(owner, { client, version: growth, periods: [mar.period], snapshotId: mar.snapshotId });
  assert.deepEqual([marCell.cell_status, await reasonKey(marCell)], ["absent", "prior_period_absent"]);
  assert.deepEqual((await rootQuery("select period_id from clara.metric_cell_periods where cell_id=$1 order by ordinal", [marCell.id])).rows.map((row) => row.period_id), [mar.period.id]);
  const feb = await mintPeriodWithMovement(owner, { client, monthStart: febStart, cents: 110_000 });
  const monthSource = await mintMetricInput(owner, { client, periodIds: [mar.period.id, feb.period.id] });
  const monthOk = await evaluate(owner, { client, version: growth, periods: [mar.period, feb.period], snapshotId: monthSource.snapshotId });
  assert.equal(monthOk.cell_status, "ok");
  assert.deepEqual((await rootQuery("select period_id from clara.metric_cell_periods where cell_id=$1 order by ordinal", [monthOk.id])).rows.map((row) => row.period_id), [mar.period.id, feb.period.id]);
  const fyClient = await freshDeltaClient(owner, "fy-prior");
  await createStandardSets(owner, fyClient);
  const fyGrowth = await approvedDefinition(owner, {
    client: fyClient, key: `fy_growth_${randomUUID()}`,
    ast: metricAst({ root: {
      node: "percent_change", current: measure({ set: "revenue" }),
      prior: { node: "lag", periods: 1, of: measure({ set: "revenue" }) },
    } }),
  });
  const firstProposal = await proposeFY(owner, { client: fyClient, startsOn: "2023-01-01" });
  const firstReceipt = await openFY(owner, { client: fyClient, label: "Delta FY 2023", startsOn: "2023-01-01", endsOn: firstProposal.ends_on });
  await plainEntry(owner, { client: fyClient, debit: BANK1, credit: REVN, cents: 100_000,
    postingDate: "2023-06-15", memo: "delta FY predecessor revenue" });
  const firstPeriod = (await reportingPeriodRows(fyClient, "fiscal_year")).find((row) => row.fiscal_year_id === firstReceipt.fiscal_year_id);
  const firstSource = await mintMetricInput(owner, { client: fyClient, periodIds: [firstPeriod.id] });
  const firstCell = await evaluate(owner, { client: fyClient, version: fyGrowth, periods: [firstPeriod], snapshotId: firstSource.snapshotId });
  assert.equal(firstCell.cell_status, "absent");
  assert.equal(await reasonKey(firstCell), "prior_period_absent");
  const secondStarts = new Date(`${firstProposal.ends_on}T00:00:00Z`);
  secondStarts.setUTCDate(secondStarts.getUTCDate() + 1);
  const secondStartsOn = secondStarts.toISOString().slice(0, 10);
  const secondProposal = await proposeFY(owner, { client: fyClient, startsOn: secondStartsOn });
  const secondReceipt = await openFY(owner, { client: fyClient, label: "Delta FY successor", startsOn: secondStartsOn, endsOn: secondProposal.ends_on });
  await plainEntry(owner, { client: fyClient, debit: BANK1, credit: REVN, cents: 125_000,
    postingDate: `${secondStartsOn.slice(0, 4)}-06-15`, memo: "delta FY successor revenue" });
  const secondPeriod = (await reportingPeriodRows(fyClient, "fiscal_year")).find((row) => row.fiscal_year_id === secondReceipt.fiscal_year_id);
  assert.equal(new Date(firstPeriod.period_end).getTime() + 86_400_000, new Date(secondPeriod.period_start).getTime(),
    "the supplied prior is the exact FY predecessor by inclusive boundary");
  const fySource = await mintMetricInput(owner, { client: fyClient, periodIds: [secondPeriod.id, firstPeriod.id] });
  const fyOk = await evaluate(owner, { client: fyClient, version: fyGrowth, periods: [secondPeriod, firstPeriod], snapshotId: fySource.snapshotId });
  assert.equal(fyOk.cell_status, "ok"); assert.equal(Number(fyOk.exact_numerator) / Number(fyOk.exact_denominator), 0.25);
  assert.deepEqual((await rootQuery("select period_id from clara.metric_cell_periods where cell_id=$1 order by ordinal", [fyOk.id])).rows.map((row) => row.period_id), [secondPeriod.id, firstPeriod.id]);
});
await t.test("a run context refuses exact period-ordinal reuse with a different order", async () =>
  assertContextOrderRefusal(world.users.alice, await freshDeltaClient(world.users.alice, "context-order")));
await t.test("zero denominator, negative denominator, and missing rows execute both default and opt-in arms", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "edge-absence"), standardSets = await createStandardSets(owner, client), zeroReceipt = standardSets.get("empty_zero"), zeroVersion = zeroReceipt.account_set_version_id ?? zeroReceipt.version_id;
  const monthStart = await pastMonthStart(7);
  await plainEntry(owner, {
    client, debit: BANK1, credit: REVN, cents: 100_000,
    postingDate: `${monthStart.slice(0, 8)}10`, memo: "delta revenue",
  });
  await plainEntry(owner, {
    client, debit: BANK1, credit: EXPN, cents: 50_000,
    postingDate: `${monthStart.slice(0, 8)}11`, memo: "delta negative expense base",
  });
  const { period } = await mintMonthPeriod(owner, { client, monthStart });
  const fx = { period, ...(await mintMetricInput(owner, { client, periodIds: [period.id] })) };
  const zeroFrozen = (await rootQuery(`select v.zero_when_no_rows,v.frozen_member_count,count(m.account_id)::int members,min(a.account_code) account_code,bool_and(a.is_active) active,(select count(*)::int from clara.metric_input_snapshot_contributions c where c.snapshot_id=$2 and c.bound_period_id=$3 and c.account_id=any(array_agg(m.account_id))) facts from clara.account_set_versions v join clara.account_set_version_members m on m.account_set_version_id=v.id join clara.coa_accounts a on a.account_id=m.account_id where v.id=$1 group by v.id`, [zeroVersion, fx.snapshotId, period.id])).rows[0]; assert.deepEqual(zeroFrozen, { zero_when_no_rows: true, frozen_member_count: 1, members: 1, account_code: standardSets.emptyZeroCode, active: true, facts: 0 }, "zero policy binds one positively read active governed account with no target-period fact rows");
  // The zero policy needs a live frozen account. i2 makes an explicit MISS its own named refusal, so the empty-population case is provoked with a non-explicit selector whose range matches nothing.
  const emptyZeroKey = `empty_zero_refusal_${randomUUID()}`, emptyZeroOp = `delta-empty-zero-${randomUUID()}`, emptyZeroError = await caught(() => createAccountSet(owner, { client, key: emptyZeroKey, selector: { code_from: "99999997", code_to: "99999998" }, zeroWhenNoRows: true, opKey: emptyZeroOp })); assert.equal(emptyZeroError?.code, "CLR10"); assert.equal(reasonOf(emptyZeroError), "scope_mismatch"); assert.match(errorDetail(emptyZeroError).fix ?? "", /^select at least one live account whose requested period may have no fact rows$/i); assert.deepEqual((await rootQuery(`select count(distinct s.id)::int sets,count(v.id)::int versions from clara.account_sets s left join clara.account_set_versions v on v.account_set_id=s.id where s.firm_id=(select firm_id from clara.clients where id=$1)and s.set_key=$2`, [client, emptyZeroKey])).rows[0], { sets: 0, versions: 0 }); assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='create_account_set_v1' and op_key=$1", [emptyZeroOp])).rows[0].n, 0);
  const definitions = [
    ["divide_zero", metricAst({ root: { node: "divide", num: measure({ set: "revenue" }), den: constant("zero") }, unit: "money" }), false],
    ["negative_refuse", metricAst({ root: { node: "divide", num: measure({ set: "revenue" }), den: measure({ set: "expense" }) } }), false],
    ["negative_allowed", metricAst({ root: { node: "divide", num: measure({ set: "revenue" }), den: measure({ set: "expense" }) } }), true],
    ["absent", metricAst({ root: measure({ set: "empty_absent" }), unit: "money" }), false],
    ["zero_rows", metricAst({ root: measure({ set: "empty_zero" }), unit: "money" }), false],
  ];
  const cells = new Map();
  for (const [tag, ast, allowNegative] of definitions) {
    const version = await approvedDefinition(owner, { client, key: `${tag}_${randomUUID()}`, unit: ast.unit, ast, allowNegative });
    cells.set(tag, await evaluate(owner, { client, version, periods: [fx.period], snapshotId: fx.snapshotId }));
  }
  assert.deepEqual([cells.get("divide_zero").cell_status, await reasonKey(cells.get("divide_zero"))],
    ["undefined", "divide_by_zero"]);
  assert.deepEqual([cells.get("negative_refuse").cell_status, await reasonKey(cells.get("negative_refuse"))],
    ["undefined", "negative_denominator"]);
  assert.equal(cells.get("negative_allowed").cell_status, "ok");
  assert.match(JSON.stringify(cells.get("negative_allowed").inputs), /negative_base/i);
  assert.equal(cells.get("absent").cell_status, "absent");
  assert.deepEqual([cells.get("zero_rows").cell_status, String(cells.get("zero_rows").exact_numerator)], ["ok", "0"]); for (const tag of ["absent", "zero_rows"]) { await assessMetricIndependentHuman(owner, { cell: cells.get(tag).id }); const assessment = (await rootQuery("select matches,observed_status,observed_numerator,observed_denominator from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [cells.get(tag).id])).rows[0]; assert.deepEqual([assessment.matches, assessment.observed_status], [true, cells.get(tag).cell_status], `${tag} independently reproduces`); if (tag === "zero_rows") assert.deepEqual([String(assessment.observed_numerator), String(assessment.observed_denominator)], ["0", "1"]); }
});
await t.test("account-set versions resolve historically, remint lawfully, and refuse later-wide expansion", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "set-drift");
  await createStandardSets(owner, client); const oldStart = await pastMonthStart(7), laterStart = addMonths(oldStart, 1);
  const oldSet = await createAccountSet(owner, { client, key: "revenue_drift", selector: { account_types: ["income"] }, effectiveFrom: oldStart });
  const version = await approvedDefinition(owner, { client, key: `drift_${randomUUID()}`, unit: "money", appliesFrom: oldStart, ast: metricAst({ root: measure({ set: "revenue_drift" }), unit: "money" }) });
  const historical = await mintPeriodWithMovement(owner, { client, monthStart: oldStart, cents: 97 }), oldSetId = oldSet.account_set_version_id ?? oldSet.version_id, oldCell = await evaluate(owner, { client, version, periods: [historical.period], snapshotId: historical.snapshotId }); assert.equal(oldCell.cell_status, "ok"); assert.equal((await rootQuery("select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2", [oldCell.id, oldSetId])).rows[0].n, 1);
  const oldFrozenCount = Number((await rootQuery("select frozen_member_count from clara.account_set_versions where id=$1", [oldSetId])).rows[0].frozen_member_count), newRevenueCode = `9${randomUUID().replace(/\D/g, "").slice(0, 6).padEnd(6, "7")}`; await upsertAccountClassed(owner, { client, code: newRevenueCode, name: "Delta Revenue Added After Freeze", type: "income" });
  await assessMetricIndependentHuman(owner, { cell: oldCell.id }); const sameCellMismatch = (await rootQuery(`select matches,observed_status,observed_reason_key,observed_numerator,observed_denominator,details from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1`, [oldCell.id])).rows[0]; assert.deepEqual([sameCellMismatch.matches, sameCellMismatch.observed_status, sameCellMismatch.observed_reason_key, sameCellMismatch.details.expected_cell_id, sameCellMismatch.details.expected_status, sameCellMismatch.details.expected_reason_key], [false, "refused", "account_set_drift", oldCell.id, "ok", null], "E6 reaches a same-cell mismatch after lawful current-chart drift"); assert.deepEqual(sameCellMismatch.details.observed_account_set_version_ids, [oldSetId]); assert.deepEqual(sameCellMismatch.details.expected_account_set_version_ids, [oldSetId], "the mismatch keeps the same pinned account-set identity"); assert.deepEqual([sameCellMismatch.observed_numerator, sameCellMismatch.observed_denominator], [null, null]); assert.notDeepEqual(sameCellMismatch.details.observed_evaluator_inputs, sameCellMismatch.details.expected_evaluator_inputs, "the independent evaluator persists the observed drift provenance instead of failing on expected-cell identity");
  const unchanged = (await rootQuery(`select c.cell_status,c.exact_numerator,c.exact_denominator,v.frozen_member_count,(select count(*)::int from clara.account_set_version_members m join clara.coa_accounts a on a.account_id=m.account_id where m.account_set_version_id=v.id and a.account_code=$3)new_account_members,(select count(*)::int from clara.metric_input_snapshot_contributions s join clara.coa_accounts a on a.account_id=s.account_id where s.snapshot_id=$2 and a.account_code=$3)new_account_facts from clara.metric_cells c join clara.account_set_versions v on v.id=$4 where c.id=$1`, [oldCell.id, historical.snapshotId, newRevenueCode, oldSetId])).rows[0]; assert.deepEqual([unchanged.cell_status, String(unchanged.exact_numerator), String(unchanged.exact_denominator), Number(unchanged.frozen_member_count), unchanged.new_account_members, unchanged.new_account_facts], ["ok", String(oldCell.exact_numerator), String(oldCell.exact_denominator), oldFrozenCount, 0, 0], "the same-cell negative does not mutate the frozen set, snapshot facts, or authoritative cell");
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: laterStart, debit: BANK1, credit: newRevenueCode, cents: 101 });
  const cell = await evaluate(owner, {
    client, version, periods: [fx.period], snapshotId: fx.snapshotId,
  });
  assert.equal(cell.cell_status, "refused");
  assert.equal(await reasonKey(cell), "account_set_drift");
  const reason = (await rootQuery(
    "select semantics from clara.metric_na_reason_versions where id=$1", [cell.na_reason_version_id],
  )).rows[0].semantics;
  assert.match(JSON.stringify(reason), /mint a new account-set version/i);
  const remint = await createAccountSet(owner, { client, key: "revenue_drift", selector: { account_types: ["income"] }, effectiveFrom: laterStart });
  const recovered = await evaluate(owner, { client, version, periods: [fx.period], snapshotId: fx.snapshotId });
  assert.deepEqual([recovered.cell_status, String(recovered.exact_numerator), String(recovered.exact_denominator)], ["ok", "101", "1"]); assert.equal((await rootQuery(`select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2`, [recovered.id, remint.account_set_version_id ?? remint.version_id])).rows[0].n, 1); const historicalAfterRemint = await evaluate(owner, { client, version, periods: [historical.period], snapshotId: historical.snapshotId }); assert.deepEqual([historicalAfterRemint.cell_status, await reasonKey(historicalAfterRemint)], ["refused", "account_set_drift"], "the historical version stays pinned but current chart drift remains visible rather than silently replaying stale membership"); assert.equal((await rootQuery("select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2", [historicalAfterRemint.id, oldSetId])).rows[0].n, 1, "the superseded historical version remains the exact target-period identity"); await assessMetricIndependentHuman(owner, { cell: historicalAfterRemint.id }); assert.equal((await rootQuery("select matches from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [historicalAfterRemint.id])).rows[0].matches, true);
  const wideStart = addMonths(laterStart, 1), prefix = `7${randomUUID().replace(/\D/g, "").slice(0, 4).padEnd(4, "0")}`; for (let i = 0; i < 513; i += 1) await upsertAccountClassed(owner, { client, code: `${prefix}${String(i).padStart(3, "0")}`, name: `Delta later-wide ${i}`, type: "expense" }); const wideSet = await createAccountSet(owner, { client, key: "revenue_drift", selector: { account_types: ["income", "expense"] }, effectiveFrom: wideStart }), wideSetId = wideSet.account_set_version_id ?? wideSet.version_id, wide = await mintPeriodWithMovement(owner, { client, monthStart: wideStart, cents: 103 }), wideCell = await evaluate(owner, { client, version, periods: [wide.period], snapshotId: wide.snapshotId }), wideResolution = wideCell.inputs.account_set_resolution; assert.deepEqual([wideCell.cell_status, await reasonKey(wideCell), wideResolution.version_id], ["refused", "account_set_expansion", wideSetId]); assert.ok(wideResolution.measured_count > 512, "the persisted resolution carries its exact over-limit measured count"); assert.equal((await rootQuery("select count(*)::int n from clara.metric_cell_account_sets where cell_id=$1 and account_set_version_id=$2", [wideCell.id, wideSetId])).rows[0].n, 1); assert.equal((await rootQuery("select frozen_member_count from clara.account_set_versions where id=$1", [wideSetId])).rows[0].frozen_member_count, wideResolution.measured_count); await assessMetricIndependentHuman(owner, { cell: wideCell.id }); const wideAssessment = (await rootQuery("select matches,observed_status,observed_reason_key,observed_numerator,observed_denominator,details from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [wideCell.id])).rows[0]; assert.deepEqual([wideAssessment.matches, wideAssessment.observed_status, wideAssessment.observed_reason_key, wideAssessment.observed_numerator, wideAssessment.observed_denominator], [true, "refused", "account_set_expansion", null, null]); assert.deepEqual(wideAssessment.details.observed_account_set_version_ids, [wideSetId]);
});await t.test("a retired filing cannot erase its immutable metric snapshot, cell, or E6 result", async () => { const owner = world.users.alice, client = await freshDeltaClient(owner, "retired-filing"), monthStart = await pastMonthStart(5), cited = await verifiedDocument(owner, client, "delta retained filing source"), draft = await draftEntryV3(owner, { client, resolution: freshResolution(owner, client, { subjectKind: "document", subjectId: cited.documentId }), opKey: `delta-retained-${randomUUID()}`, document: cited.documentId, sha256: cited.sha256, postingDate: `${monthStart.slice(0, 8)}10`, memo: "delta retained filing entry", lines: [{ account_code: BANK1, debit_cents: 211, credit_cents: 0, description: "dr" }, { account_code: REVN, debit_cents: 0, credit_cents: 211, description: "cr" }] }); await approveEntry(owner, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: `delta-retained-approve-${randomUUID()}` }); assert.deepEqual((await rootQuery("select e.status,e.reversed_by,f.retired_at is null filing_active from clara.journal_entries e join clara.document_filings f on f.id=$2 where e.id=$1", [draft.entry_id, cited.filingId])).rows[0], { status: "approved", reversed_by: null, filing_active: true }, "the governed filing is active when the source snapshot is minted"); await createStandardSets(owner, client); const { period } = await mintMonthPeriod(owner, { client, monthStart }), { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] }), version = await approvedDefinition(owner, { client, key: `retired_filing_${randomUUID()}`, unit: "money", ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }) }), before = await evaluate(owner, { client, version, periods: [period], snapshotId }), captured = (await rootQuery("select journal_line_id,entry_id,document_id,filing_id,source_doc_sha256,debit_cents,credit_cents from clara.metric_input_snapshot_contributions where snapshot_id=$1 and entry_id=$2 order by journal_line_id", [snapshotId, draft.entry_id])).rows; assert.deepEqual([before.cell_status, String(before.exact_numerator), String(before.exact_denominator)], ["ok", "211", "1"]); assert.ok(captured.length > 0 && captured.every((row) => row.document_id === cited.documentId && row.filing_id === cited.filingId && row.source_doc_sha256 === cited.sha256)); const reversal = await reverseEntryGoverned(owner, draft.entry_id), reversalId = reversal.reversal_id ?? reversal.entry_id ?? reversal.id; await retireFilingGoverned(owner, cited.filingId); assert.deepEqual((await rootQuery("select o.status,o.reversed_by,r.status reversal_status,r.reversal_of,f.retired_at is not null retired from clara.journal_entries o join clara.journal_entries r on r.id=o.reversed_by join clara.document_filings f on f.id=$2 where o.id=$1", [draft.entry_id, cited.filingId])).rows[0], { status: "approved", reversed_by: reversalId, reversal_status: "approved", reversal_of: draft.entry_id, retired: true }); assert.deepEqual((await rootQuery("select journal_line_id,entry_id,document_id,filing_id,source_doc_sha256,debit_cents,credit_cents from clara.metric_input_snapshot_contributions where snapshot_id=$1 and entry_id=$2 order by journal_line_id", [snapshotId, draft.entry_id])).rows, captured); assert.deepEqual((await rootQuery("select cell_status,exact_numerator,exact_denominator from clara.metric_cells where id=$1", [before.id])).rows[0], { cell_status: "ok", exact_numerator: before.exact_numerator, exact_denominator: before.exact_denominator }); const replay = await evaluate(owner, { client, version, periods: [period], snapshotId }); assert.deepEqual([replay.cell_status, String(replay.exact_numerator), String(replay.exact_denominator)], ["ok", "211", "1"]); assert.deepEqual((await rootQuery("select entry_id from clara.metric_cell_entries where cell_id=$1 order by entry_id", [replay.id])).rows.map((row) => row.entry_id), [draft.entry_id]); assert.deepEqual((await rootQuery("select document_id from clara.metric_cell_documents where cell_id=$1 order by document_id", [replay.id])).rows.map((row) => row.document_id), [cited.documentId]); await assessMetricIndependentHuman(owner, { cell: before.id }); assert.equal((await rootQuery("select matches from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [before.id])).rows[0].matches, true); await assessMetricIndependentHuman(owner, { cell: replay.id }); const replayAssessment = (await rootQuery("select matches,details from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [replay.id])).rows[0]; assert.equal(replayAssessment.matches, true); assert.deepEqual(replayAssessment.details.observed_entry_ids, [draft.entry_id]); assert.deepEqual(replayAssessment.details.observed_document_ids, [cited.documentId]); assert.equal(replayAssessment.details.observed_entry_ids.includes(reversalId), false); });
await t.test("captured row-wise natural signs cover debit and credit normals; rounding stays exact", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(world.users.alice, "sign-round");
  await createStandardSets(owner, client);
  await createAccountSet(owner, { client, key: "liability", selector: { account_codes: [AP1] } });
  await createAccountSet(owner, { client, key: "equity", selector: { account_codes: [RE1] } });
  await createAccountSet(owner, { client, key: "mixed_signs", selector: { account_codes: [EXPN, REVN] } });
  const monthStart = await pastMonthStart(6), postingDate = `${monthStart.slice(0, 8)}10`;
  for (const [debit, credit, cents, memo] of [[EXPN, BANK1, 101, "expense"], [BANK1, RE1, 109, "equity"]]) await plainEntry(owner, { client, debit, credit, cents, postingDate, memo: `delta ${memo} sign` });
  const citedRevenue = await verifiedDocument(owner, client, "delta revenue sign source"), revenueDraft = await draftEntryV3(owner, { client, resolution: freshResolution(owner, client, { subjectKind: "document", subjectId: citedRevenue.documentId }), opKey: `delta-sign-revenue-${randomUUID()}`, document: citedRevenue.documentId, sha256: citedRevenue.sha256, postingDate, memo: "delta revenue sign", lines: [{ account_code: BANK1, debit_cents: 103, credit_cents: 0, description: "dr" }, { account_code: REVN, debit_cents: 0, credit_cents: 103, description: "cr" }] }); await approveEntry(owner, { entry: revenueDraft.entry_id, expectedRevision: revenueDraft.revision_token, opKey: `delta-sign-revenue-approve-${randomUUID()}` });
  await postCounterpartyEntry(owner, { client, counterparty: await birthCounterparty(owner, { client, name: `Delta sign vendor ${randomUUID().slice(0, 8)}`, kind: "vendor", /* DATE-ROLLOVER CLASS (x42 fix, same PR): birthCounterparty's fixed "2026-03-15" default is wall-clock-collidable -- pastMonthStart(6) reaches it at real "now"=Sep 2026, inflating captured.length 4->6 -- so anchor a year before this cell's own monthStart instead, outside `period` under any real "now" */ postingDate: `${addMonths(monthStart, -12).slice(0, 8)}10` }), kind: "vendor", debit: BANK1, credit: AP1, cents: 107, postingDate, memo: "delta liability sign" });
  const { period } = await mintMonthPeriod(owner, { client, monthStart });
  const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });
  const captured = (await rootQuery(`select c.account_type,c.account_class,a.account_type live_type,a.account_class live_class from clara.metric_input_snapshot_contributions c join clara.coa_accounts a on a.account_id=c.account_id where c.snapshot_id=$1 and c.account_id in(select account_id from clara.coa_accounts where client_id=$2 and account_code=any($3::text[])) order by c.account_type,c.account_class nulls first`, [snapshotId, client, [EXPN, REVN, AP1, RE1]])).rows;
  assert.equal(captured.length, 4); assert.ok(captured.every((row) => row.account_type === row.live_type && row.account_class === row.live_class), "each immutable fact captures its source account type/class");
  const definitions = [["expense_natural", measure({ set: "expense" }), "money"], ["revenue_natural", measure({ set: "revenue" }), "money"],
    ["liability_natural", measure({ set: "liability" }), "money"], ["equity_natural", measure({ set: "equity" }), "money"], ["mixed_natural", measure({ set: "mixed_signs" }), "money"],
    ["expense_positive", measure({ set: "expense", presentAs: "positive_expense" }), "money"], ["revenue_positive", measure({ set: "revenue", presentAs: "positive_revenue" }), "money"],
    ["negative_tie", { node: "multiply", left: constant("negative_one"), right: constant("half") }, "ratio"], ["unrounded_total", { node: "sum", terms: [{ node: "divide", num: constant("third"), den: constant("half") }, { node: "divide", num: constant("third"), den: constant("half") }] }, "ratio"]];
  const cells = new Map();
  for (const [tag, root, unit] of definitions) {
    const ast = metricAst({ root, unit, resultScale: 0 });
    const version = await approvedDefinition(owner, { client, key: `${tag}_${randomUUID()}`, unit, resultScale: 0, ast, allowNegative: tag === "negative_tie" });
    cells.set(tag, await evaluate(owner, { client, version, periods: [period], snapshotId }));
  }
  for (const [tag, expected] of [["expense_natural", "101"], ["revenue_natural", "103"],
    ["liability_natural", "107"], ["equity_natural", "109"], ["mixed_natural", "204"],
    ["expense_positive", "101"], ["revenue_positive", "103"]])
    assert.deepEqual([String(cells.get(tag).exact_numerator), String(cells.get(tag).exact_denominator)], [expected, "1"], tag);
  const wrongSignVersion = await approvedDefinition(owner, { client, key: `sign_mismatch_${randomUUID()}`, unit: "money", resultScale: 0, ast: metricAst({ root: measure({ set: "revenue", presentAs: "positive_expense" }), unit: "money", resultScale: 0 }) }), wrongSign = await evaluate(owner, { client, version: wrongSignVersion, periods: [period], snapshotId }); assert.deepEqual([wrongSign.cell_status, await reasonKey(wrongSign), wrongSign.exact_numerator, wrongSign.exact_denominator], ["refused", "sign_presentation_mismatch", null, null]); assert.match(JSON.stringify((await rootQuery("select semantics from clara.metric_na_reason_versions where id=$1", [wrongSign.na_reason_version_id])).rows[0].semantics), /use natural presentation|match positive_expense/i); const wrongSignEntries = (await rootQuery("select entry_id from clara.metric_cell_entries where cell_id=$1 order by entry_id", [wrongSign.id])).rows.map((row) => row.entry_id), wrongSignDocuments = (await rootQuery("select document_id from clara.metric_cell_documents where cell_id=$1 order by document_id", [wrongSign.id])).rows.map((row) => row.document_id); assert.deepEqual(wrongSignEntries, [revenueDraft.entry_id]); assert.deepEqual(wrongSignDocuments, [citedRevenue.documentId]); assert.deepEqual([wrongSign.inputs.normalized_provenance.entry_ids, wrongSign.inputs.normalized_provenance.document_ids], [wrongSignEntries, wrongSignDocuments]); assert.equal(wrongSign.inputs.provenance_not_applicable.documents, undefined); await assessMetricIndependentHuman(owner, { cell: wrongSign.id }); const wrongSignAssessment = (await rootQuery("select matches,observed_status,observed_reason_key,observed_numerator,observed_denominator,details from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [wrongSign.id])).rows[0]; assert.deepEqual([wrongSignAssessment.matches, wrongSignAssessment.observed_status, wrongSignAssessment.observed_reason_key, wrongSignAssessment.observed_numerator, wrongSignAssessment.observed_denominator, wrongSignAssessment.details.observed_entry_ids, wrongSignAssessment.details.observed_document_ids], [true, "refused", "sign_presentation_mismatch", null, null, wrongSignEntries, wrongSignDocuments]);
  await assessMetricIndependentHuman(owner, { cell: cells.get("mixed_natural").id });
  const signCheck = (await rootQuery(`select matches,observed_numerator,observed_denominator from clara.metric_cell_assessments
    where cell_id=$1 order by assessed_at desc limit 1`, [cells.get("mixed_natural").id])).rows[0];
  assert.deepEqual([signCheck.matches, String(signCheck.observed_numerator), String(signCheck.observed_denominator)], [true, "204", "1"]);
  assert.match(JSON.stringify(cells.get("expense_positive").inputs), /positive_expense/i);
  assert.match(JSON.stringify(cells.get("revenue_positive").inputs), /positive_revenue/i);
  assert.equal(String(cells.get("negative_tie").exact_numerator), "-1");
  assert.equal(String(cells.get("negative_tie").exact_denominator), "2");
  assert.equal(cells.get("negative_tie").displayed_text, "-1", "exact -1/2 rounds away from zero");
  assert.equal(cells.get("unrounded_total").displayed_text, "1", "two unrounded 2/3 values total to 4/3 then round once");
  assert.equal(String(cells.get("unrounded_total").exact_numerator), "4");
  assert.equal(String(cells.get("unrounded_total").exact_denominator), "3");
  await expectProposalRefusal(owner, { client, key: `midtree_sign_${randomUUID()}`, ast: metricAst({ root: { node: "sum", present_as: "positive_expense", terms: [measure({ set: "expense" })] }, unit: "money" }), unit: "money" }, "unknown_field", /node|terms|present_as|allowed/i);
});
await t.test("closing_balance uses the immutable period-end sample, including opening-only liability and equity", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "closing-balance");
  const monthStart = await pastMonthStart(5);
  const openingDate = new Date(`${monthStart}T00:00:00Z`);
  openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const openingPostingDate = openingDate.toISOString().slice(0, 10);
  await postCounterpartyEntry(owner, {
    client, counterparty: await birthCounterparty(owner, {
      client, name: `Delta opening vendor ${randomUUID().slice(0, 8)}`, kind: "vendor",
    }), kind: "vendor", debit: BANK1, credit: AP1, cents: 225_000,
    postingDate: openingPostingDate, memo: "delta opening-only liability",
  });
  await plainEntry(owner, {
    client, debit: BANK1, credit: RE1, cents: 375_000, postingDate: openingPostingDate,
    memo: "delta opening-only equity",
  });
  await createStandardSets(owner, client);
  const { period } = await mintMonthPeriod(owner, { client, monthStart });
  const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });
  for (const [key, code, rawExpected, naturalExpected] of [["liability", AP1, -225_000, 225_000], ["equity", RE1, -375_000, 375_000]]) {
    await createAccountSet(owner, { client, key: `closing_${key}`, selector: { account_codes: [code] } });
    const sample = (await rootQuery(
      `select s.sample_date,s.balance_cents,p.period_end
         from clara.metric_input_snapshot_samples s
         join clara.reporting_periods p on p.id=s.period_id
        where s.snapshot_id=$1 and s.period_id=$2
          and s.account_id=(select account_id from clara.coa_accounts where client_id=$3 and account_code=$4)
        order by s.sample_date desc limit 1`, [snapshotId, period.id, client, code],
    )).rows[0];
    assert.equal(sample.sample_date.getTime(), sample.period_end.getTime(), `${key} reads the immutable period-end sample`);
    assert.equal(Number(sample.balance_cents), rawExpected, `${key} raw debit-minus-credit sample remains negative`);
    assert.equal((await rootQuery(
      `select count(*)::int n from clara.metric_input_snapshot_contributions c
        where c.snapshot_id=$1 and c.account_id=(select account_id from clara.coa_accounts where client_id=$2 and account_code=$3)`,
      [snapshotId, client, code],
    )).rows[0].n, 0, `${key} has no current-period movement`);
    const ast = metricAst({ root: measure({ set: `closing_${key}`, aspect: "closing_balance" }), unit: "money", temporality: "point_in_time", resultScale: 0 });
    const version = await approvedDefinition(owner, {
      client, key: `closing_${key}_${randomUUID()}`, unit: "money",
      temporality: "point_in_time", resultScale: 0, ast,
    });
    const cell = await evaluate(owner, { client, version, periods: [period], snapshotId });
    assert.equal(cell.cell_status, "ok");
    assert.equal(Number(cell.exact_numerator) / Number(cell.exact_denominator), naturalExpected);
    const average = await approvedDefinition(owner, { client, key: `closing_average_${key}_${randomUUID()}`,
      unit: "money", temporality: "period_average", resultScale: 0,
      ast: metricAst({ root: { node: "average", of: measure({ set: `closing_${key}`, aspect: "closing_balance" }) },
        unit: "money", temporality: "period_average", resultScale: 0 }) });
    const averageCell = await evaluate(owner, { client, version: average, periods: [period], snapshotId });
    assert.deepEqual([averageCell.cell_status, Number(averageCell.exact_numerator) / Number(averageCell.exact_denominator)], ["ok", naturalExpected], "avg_month_end_v1 returns the exact month-end natural balance");
    const policy = (await rootQuery(`select dv.averaging_policy_id,ap.policy_key,ap.implemented,ap.effective_from,ap.effective_to,dv.applies_from,dv.applies_to from clara.metric_definition_versions dv join clara.averaging_policy_versions ap on ap.id=dv.averaging_policy_id where dv.id=$1`, [average])).rows[0]; assert.equal(policy.policy_key, "avg_month_end_v1"); assert.equal(policy.implemented, true); assert.ok(policy.averaging_policy_id); assert.ok(new Date(policy.effective_from) <= new Date(policy.applies_from)); assert.ok(policy.effective_to == null || (policy.applies_to != null && new Date(policy.effective_to) >= new Date(policy.applies_to)));
    await assessMetricIndependentHuman(owner, { cell: averageCell.id });
    const assessment = (await rootQuery(`select matches,observed_status,observed_numerator,observed_denominator from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1`, [averageCell.id])).rows[0]; assert.deepEqual([assessment.matches, assessment.observed_status, Number(assessment.observed_numerator) / Number(assessment.observed_denominator)], [true, "ok", naturalExpected]);
  }
});
await t.test("E6 independently reproduces a composite AST", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "independent");
  await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(5), cents: 100_000 }); await plainEntry(owner, { client, debit: EXPN, credit: BANK1, cents: 25_000, postingDate: `${new Date(fx.period.period_start).toISOString().slice(0, 8)}10`, memo: "delta composite expense" }); const compositeSource = await mintMetricInput(owner, { client, periodIds: [fx.period.id] });
  const composite = await approvedDefinition(owner, {
    client, key: `composite_${randomUUID()}`,
    ast: metricAst({ root: { node: "divide", num: { node: "subtract",
      left: measure({ set: "revenue" }), right: measure({ set: "expense" }) },
    den: measure({ set: "revenue" }) } }),
  });
  const compositeCell = await evaluate(owner, { client, version: composite, periods: [fx.period], snapshotId: compositeSource.snapshotId });
  await assessMetricIndependentHuman(owner, { cell: compositeCell.id });
  const matching = (await rootQuery(
    "select * from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [compositeCell.id],
  )).rows[0];
  assert.ok(matching); assert.deepEqual([compositeCell.cell_status, String(compositeCell.exact_numerator), String(compositeCell.exact_denominator), matching.matches, matching.observed_status, String(matching.observed_numerator), String(matching.observed_denominator)], ["ok", "3", "4", true, "ok", "3", "4"]);
  assert.deepEqual(matching.details.observed_evaluator_inputs, matching.details.expected_evaluator_inputs, "primary and E6 persist identical recursive evaluator inputs"); const inputTree = compositeCell.inputs.input_values, topOperands = inputTree.operands, numeratorOperands = topOperands[0].input.operands; assert.deepEqual([inputTree.node, topOperands.map((operand) => operand.operand), numeratorOperands.map((operand) => operand.input.account_set_resolution.set_key), topOperands[1].input.account_set_resolution.set_key], ["divide", ["num", "den"], ["revenue", "expense"], "revenue"]); assert.deepEqual(numeratorOperands.map((operand) => [String(operand.value.numerator), String(operand.value.denominator)]), [["100000", "1"], ["25000", "1"]]); assert.deepEqual(topOperands.map((operand) => [String(operand.value.numerator), String(operand.value.denominator)]), [["75000", "1"], ["100000", "1"]]);
});
await t.test("open-item counts exclude fully settled items and allocation facts stay a captured-item subset", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "allocation-subset");
  const cp = await birthCounterparty(owner, { client, name: `Delta allocation ${randomUUID().slice(0, 8)}`, kind: "customer" });
  const monthStart = await pastMonthStart(4), postingDate = `${monthStart.slice(0, 8)}05`;
  const invoice = await openArItem57(owner, { client, cp, cents: 80_000, postingDate });
  const receipt = await allocateReceipt57(owner, { client, counterparty: cp, postingDate,
    bankAccount: BANK1, amountCents: 30_000, allocations: [{ item_id: invoice.item, amount_cents: 30_000 }] });
  assert.equal((await rootQuery("select count(*)::int n from clara.open_item_allocations where application_group=$1 and amount_cents>0", [receipt.group_id])).rows[0].n, 1);
  assert.equal((await rootQuery("select count(*)::int n from clara.open_item_allocations where application_group=$1 and item_id=$2 and amount_cents<0", [receipt.group_id, invoice.item])).rows[0].n, 1);
  const { period } = await mintMonthPeriod(owner, { client, monthStart });
  const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });
  const openItems = new Set((await rootQuery(
    "select item_id from clara.metric_input_snapshot_open_items where snapshot_id=$1", [snapshotId],
  )).rows.map((row) => row.item_id));
  const allocations = (await rootQuery(
    "select allocation_id,item_id,amount_cents from clara.metric_input_snapshot_allocations where snapshot_id=$1 order by allocation_id",
    [snapshotId],
  )).rows;
  assert.ok(allocations.some((row) => BigInt(row.amount_cents) > 0n), "at least one positive governed allocation was captured");
  assert.deepEqual(allocations.filter((row) => !openItems.has(row.item_id)), [],
    "every captured allocation item_id is a captured open-item identity");
  await assertSettledSignedCount(owner, { client, period, snapshotId });
});
await t.test("fn_owner raw cells reject context, definition, formula, evaluator, unit, scale, and N/A breaks", async () => {
  const owner = world.users.alice, clientA = await freshDeltaClient(owner, "cell-congruence-a");
  const foreignOwner = world.users.dave;
  const clientB = await freshDeltaClient(foreignOwner, "cell-congruence-foreign-firm");
  assert.notEqual((await rootQuery("select firm_id from clara.clients where id=$1", [clientA])).rows[0].firm_id,
    (await rootQuery("select firm_id from clara.clients where id=$1", [clientB])).rows[0].firm_id,
    "the definition attack crosses a genuine firm boundary");
  await createStandardSets(owner, clientA);
  await createStandardSets(foreignOwner, clientB);
  const fxA = await mintPeriodWithMovement(owner, { client: clientA, monthStart: await pastMonthStart(4), cents: 100_000 });
  const fxB = await mintPeriodWithMovement(foreignOwner, { client: clientB, monthStart: await pastMonthStart(4), cents: 200_000 });
  const versionA = await approvedDefinition(owner, {
    client: clientA, key: `cell_a_${randomUUID()}`, unit: "money", resultScale: 0,
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money", resultScale: 0 }),
  });
  const versionB = await approvedDefinition(foreignOwner, {
    client: clientB, key: `cell_b_${randomUUID()}`, unit: "money", resultScale: 0,
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money", resultScale: 0 }),
  });
  const cellA = await evaluate(owner, { client: clientA, version: versionA, periods: [fxA.period], snapshotId: fxA.snapshotId });
  const cellB = await evaluate(foreignOwner, { client: clientB, version: versionB, periods: [fxB.period], snapshotId: fxB.snapshotId });
  assert.deepEqual([cellA.cell_status, String(cellA.exact_numerator), String(cellA.exact_denominator)], ["ok", "100000", "1"]); const contextA = (await rootQuery("select * from clara.metric_evaluation_contexts where id=$1", [cellA.evaluation_context_id])).rows[0];
  const attackContext = { ...contextA, id: randomUUID(), run_id: randomUUID() };
  await withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => {
    await db.query("set constraints clara.t_metric_context_integrity deferred");
    await db.query(`insert into clara.metric_evaluation_contexts(id,firm_id,client_id,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8)`, [attackContext.id, attackContext.firm_id, clientA, attackContext.snapshot_id,
      attackContext.evaluator_version_id, attackContext.run_id, attackContext.context_sha256, owner]);
    await db.query(`insert into clara.metric_evaluation_context_periods(context_id,snapshot_id,firm_id,client_id,period_id,period_start,period_end,ordinal)
      select $1,snapshot_id,firm_id,client_id,period_id,period_start,period_end,ordinal from clara.metric_evaluation_context_periods where context_id=$2`, [attackContext.id, contextA.id]);
    await db.query("set constraints clara.t_metric_context_integrity immediate");
  });
  assert.equal((await rootQuery("select count(*)::int n from clara.metric_evaluation_contexts ec left join clara.metric_cells c on c.evaluation_context_id=ec.id where ec.id=$1 and c.id is null", [attackContext.id])).rows[0].n, 1,
    "the coherent fresh context persists unused so the cell unique key cannot preempt an integrity wall");
  const contextError = await expectFnOwnerInsertRefusal(`with c as(insert into clara.metric_evaluation_contexts(id,firm_id,client_id,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)) insert into clara.metric_evaluation_context_periods(context_id,snapshot_id,firm_id,client_id,period_id,period_start,period_end,ordinal) select $1,$4,$2,$3,period_id,period_start,period_end,ordinal from clara.metric_evaluation_context_periods where context_id=$9`, [randomUUID(), contextA.firm_id, clientA, contextA.snapshot_id, contextA.evaluator_version_id, randomUUID(), Buffer.alloc(32, 6), owner, contextA.id]); assert.match(`${contextError.message} ${contextError.detail ?? ""}`, /context.*hash|digest|reconstruct/i);
  for (const [table, columns, prefix] of [["metric_input_snapshot_periods", "snapshot_id,firm_id,client_id", [contextA.snapshot_id, contextA.firm_id, clientA]], ["metric_evaluation_context_periods", "context_id,snapshot_id,firm_id,client_id", [contextA.id, contextA.snapshot_id, contextA.firm_id, clientA]], ["metric_cell_periods", "cell_id,firm_id,client_id", [cellA.id, contextA.firm_id, clientA]]]) { const params = [...prefix, clientB], foreignPeriodError = await expectFnOwnerInsertRefusal(`insert into clara.${table}(${columns},period_id,period_start,period_end,ordinal) select ${prefix.map((_, i) => `$${i + 1}`).join(",")},id,period_start,period_end,9 from clara.reporting_periods where client_id=$${params.length} limit 1`, params); assert.match(`${foreignPeriodError.message} ${foreignPeriodError.detail ?? ""}`, /foreign key|cross-tenant|context|period/i, table); }
  const alternateEvaluator = (await rootQuery(
    "select id from clara.evaluator_versions where id<>$1 order by evaluator_name,version limit 1", [cellA.evaluator_version_id],
  )).rows[0];
  assert.ok(contextA && attackContext && alternateEvaluator, "the cells supply isolated contexts and an independent evaluator version");
  const sql = `insert into clara.metric_cells
    (id,firm_id,client_id,run_id,evaluation_context_id,definition_version_id,formula_sha256,
     resolved_inputs_sha256,evaluator_version_id,books_watermark,cell_status,na_reason_version_id,
     exact_numerator,exact_denominator,unit_key,displayed_scale,displayed_text,inputs,
     model_proposal_id,model_proposal_provenance,human_approval_id,human_approval_provenance,supersedes_cell_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`;
  const base = [randomUUID(), cellA.firm_id, clientA, attackContext.run_id, attackContext.id, versionA,
    cellA.formula_sha256, cellA.resolved_inputs_sha256, cellA.evaluator_version_id, cellA.books_watermark,
    "ok", null, cellA.exact_numerator, cellA.exact_denominator, cellA.unit_key, cellA.displayed_scale,
    cellA.displayed_text, cellA.inputs, null, cellA.model_proposal_provenance, null, cellA.human_approval_provenance, null];
  const nonOkVersion = await approvedDefinition(owner, { client: clientA, key: `cell_non_ok_${randomUUID()}`,
    unit: "money", resultScale: 0, ast: metricAst({ root: { node: "divide", num: measure({ set: "revenue" }),
      den: constant("zero") }, unit: "money", resultScale: 0 }) });
  const nonOkCell = await evaluate(owner, { client: clientA, version: nonOkVersion, periods: [fxA.period], snapshotId: fxA.snapshotId });
  const nonOkReason = (await rootQuery("select id,cell_status,reason_key,version,to_char(effective_from,'YYYY-MM-DD') effective_from from clara.metric_na_reason_versions where id=$1", [nonOkCell.na_reason_version_id])).rows[0];
  assert.notEqual(nonOkCell.cell_status, "ok", "the N/A attacks start from a genuine deterministic non-ok result");
  // i3: the wording is chosen PERIOD-EFFECTIVELY against the root reporting period, highest version breaking a co-effective tie -- so the seeded versions carry DISTINCT windows and the resolver's choice is proved live, not merely through a refusal.
  const rootStart = (await rootQuery("select to_char(period_start,'YYYY-MM-DD') d from clara.metric_evaluation_context_periods where context_id=$1 order by ordinal limit 1", [cellA.evaluation_context_id])).rows[0].d; assert.ok(rootStart > "2019-12-31" && rootStart < "2999-01-01", `the root period ${rootStart} sits strictly between the expired and the not-yet-effective window`);
  const seedReason = async (bump, from, to, tag) => (await rootQuery("insert into clara.metric_na_reason_versions(reason_key,version,cell_status,display_token,semantics,effective_from,effective_to)values($1,$2,$3,'—',jsonb_build_object('test',$4::text),$5::date,$6::date) returning id", [nonOkReason.reason_key, Number(nonOkReason.version) + bump, nonOkReason.cell_status, tag, from, to])).rows[0].id;
  const notYetEffective = await seedReason(1, "2999-01-01", null, "later-version-not-yet-effective"), expiredReason = await seedReason(2, "2019-01-01", "2019-12-31", "version-expired-before-the-root-period");
  assert.equal((await evaluate(owner, { client: clientA, version: nonOkVersion, periods: [fxA.period], snapshotId: fxA.snapshotId })).na_reason_version_id, nonOkReason.id, "a HIGHER version that is not yet effective for the root period never displaces the effective wording");
  const coEffective = await seedReason(3, nonOkReason.effective_from, null, "co-effective-highest-version");
  assert.equal((await evaluate(owner, { client: clientA, version: nonOkVersion, periods: [fxA.period], snapshotId: fxA.snapshotId })).na_reason_version_id, coEffective, "among versions co-effective for the root period the highest version wins");
  const nonOkBase = base.with(5, nonOkVersion).with(6, nonOkCell.formula_sha256).with(7, nonOkCell.resolved_inputs_sha256)
    .with(10, nonOkCell.cell_status).with(11, coEffective).with(12, null).with(13, null).with(14, nonOkCell.unit_key)
    .with(15, null).with(16, null).with(17, nonOkCell.inputs);
  const badModel = { ...cellA.model_proposal_provenance, extra: true }, badHuman = { ...cellA.human_approval_provenance, reason: "forged" };
  const cases = [
    ["definition", base.with(0, randomUUID()).with(5, versionB), /definition|firm|client/i], ["formula", base.with(0, randomUUID()).with(6, Buffer.alloc(32, 7)), /definition|formula|hash/i],
    ["resolved_inputs", base.with(0, randomUUID()).with(7, Buffer.alloc(32, 8)), /resolved inputs|hash|reconstruct/i], ["evaluator", base.with(0, randomUUID()).with(8, alternateEvaluator.id), /context.*evaluator|evaluator.*context/i],
    ["numerator", base.with(0, randomUUID()).with(12, Number(cellA.exact_numerator) + 1), /deterministic|numerator|result/i], ["denominator", base.with(0, randomUUID()).with(13, Number(cellA.exact_denominator) + 1), /deterministic|denominator|result/i],
    ["displayed_text", base.with(0, randomUUID()).with(16, `${cellA.displayed_text}0`), /deterministic|displayed|result/i], ["unit", base.with(0, randomUUID()).with(14, "ratio"), /definition|unit/i],
    ["scale", base.with(0, randomUUID()).with(15, Number(cellA.displayed_scale) + 1), /definition|scale/i], ["named_inputs", base.with(0, randomUUID()).with(17, { ...cellA.inputs, forged: true }), /inputs|provenance|exact/i],
    ["model_provenance", base.with(0, randomUUID()).with(19, badModel), /proposal|provenance|exact/i],
    ["human_provenance", base.with(0, randomUUID()).with(21, badHuman), /approval|provenance|exact/i],
    ["supersedes_same", base.with(0, randomUUID()).with(22, cellA.id), /supersession|provenance|exact/i], ["supersedes_foreign", base.with(0, randomUUID()).with(22, cellB.id), /foreign key|cross-firm|supersession|provenance/i],
    ["definitionless", base.with(0, randomUUID()).with(5, null).with(17, { schema: "clara.metric-composition-inputs/v1" }), /definition|composition|typed/i],
    ["status_reason", nonOkBase.with(0, randomUUID()).with(10, "absent"), /deterministic|status|reason|result/i],
    ["older_reason", nonOkBase.with(0, randomUUID()).with(11, nonOkReason.id), /reason version|period-effective|exact/i],
    ["not_yet_effective_reason", nonOkBase.with(0, randomUUID()).with(11, notYetEffective), /reason version|period-effective|exact/i],
    ["expired_reason", nonOkBase.with(0, randomUUID()).with(11, expiredReason), /reason version|period-effective|exact/i],
  ];
  for (const [field, params, pattern] of cases) { const source = field.includes("reason") ? nonOkCell.id : cellA.id;
    const err = await expectFnOwnerActionRefusal(async (db) => { await db.query("set constraints clara.t_metric_cell_integrity deferred"); await db.query(sql, params);
      for (const [table, tail] of [["periods", "period_id,period_start,period_end,ordinal"], ["snapshots", "snapshot_id"], ["account_sets", "account_set_version_id"], ["constants", "constant_version_id"], ["entries", "entry_id"], ["documents", "document_id"], ["presentation_maps", "presentation_map_version_id"]]) await db.query(`insert into clara.metric_cell_${table}(cell_id,firm_id,client_id,${tail}) select $1,firm_id,client_id,${tail} from clara.metric_cell_${table} where cell_id=$2`, [params[0], source]);
      await db.query("set constraints all immediate"); }); assert.match(`${err.message} ${err.detail ?? ""}`, pattern, field); }
  const definition = (await rootQuery(`select dv.ast,dv.allow_negative,dv.edge_policy_set_id,dv.averaging_policy_id,ap.policy_key from clara.metric_definition_versions dv join clara.averaging_policy_versions ap on ap.id=dv.averaging_policy_id where dv.id=$1`, [versionA])).rows[0];
  const composition = { evaluator_entrypoint: "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)", ast: definition.ast, allow_negative: definition.allow_negative, averaging_policy: definition.policy_key }, compositionHash = (await rootQuery("select clara._hash($1::jsonb) h", [composition])).rows[0].h;
  const compositionResolved = (await rootQuery(`select clara._metric_resolved_inputs_sha256_v1(ec.context_sha256,(select array_agg(period_id order by ordinal)from clara.metric_evaluation_context_periods where context_id=ec.id),ec.firm_id,ec.client_id,null,$2,(select coalesce(array_agg(account_set_version_id order by account_set_version_id),'{}')from clara.metric_cell_account_sets where cell_id=$3),(select coalesce(array_agg(constant_version_id order by constant_version_id),'{}')from clara.metric_cell_constants where cell_id=$3),$4,$5,ec.evaluator_version_id,$6) h from clara.metric_evaluation_contexts ec where ec.id=$1::uuid`, [attackContext.id, compositionHash, cellA.id, definition.edge_policy_set_id, definition.averaging_policy_id, cellA.books_watermark])).rows[0].h;
  const compositionParams = base.with(0, randomUUID()).with(5, null).with(6, compositionHash).with(7, compositionResolved).with(16, `${cellA.displayed_text}0`).with(17, { schema: "clara.metric-composition-inputs/v1", composition });
  const compositionError = await expectFnOwnerActionRefusal(async (db) => { await db.query("set constraints clara.t_metric_cell_integrity deferred"); await db.query(sql, compositionParams);
    for (const [table, tail] of [["periods", "period_id,period_start,period_end,ordinal"], ["snapshots", "snapshot_id"], ["account_sets", "account_set_version_id"], ["constants", "constant_version_id"], ["entries", "entry_id"], ["documents", "document_id"], ["presentation_maps", "presentation_map_version_id"]]) await db.query(`insert into clara.metric_cell_${table}(cell_id,firm_id,client_id,${tail}) select $1,firm_id,client_id,${tail} from clara.metric_cell_${table} where cell_id=$2`, [compositionParams[0], cellA.id]);
    await db.query("set constraints all immediate"); }); assert.match(compositionError.message, /composition.*deterministic evaluator result/i);
  // i6: a LAWFUL definitionless composition is admitted by the write-time wall and then reproduced by the INDEPENDENT walker from the composition path alone -- the assessor never loads a definition row -- and the walker refuses a malformed node instead of recursing on it.
  const lawful = base.with(0, randomUUID()).with(5, null).with(6, compositionHash).with(7, compositionResolved).with(17, { ...cellA.inputs, schema: "clara.metric-composition-inputs/v1", composition });
  await withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => { await db.query("set constraints clara.t_metric_cell_integrity deferred"); await db.query(sql, lawful);
    for (const [table, tail] of [["periods", "period_id,period_start,period_end,ordinal"], ["snapshots", "snapshot_id"], ["account_sets", "account_set_version_id"], ["constants", "constant_version_id"], ["entries", "entry_id"], ["documents", "document_id"], ["presentation_maps", "presentation_map_version_id"]]) await db.query(`insert into clara.metric_cell_${table}(cell_id,firm_id,client_id,${tail}) select $1,firm_id,client_id,${tail} from clara.metric_cell_${table} where cell_id=$2`, [lawful[0], cellA.id]);
    await db.query("set constraints all immediate"); });
  assert.deepEqual((await rootQuery("select definition_version_id,cell_status,displayed_text,inputs->>'schema' schema from clara.metric_cells where id=$1", [lawful[0]])).rows[0], { definition_version_id: null, cell_status: cellA.cell_status, displayed_text: cellA.displayed_text, schema: "clara.metric-composition-inputs/v1" }, "the lawful definitionless composition passes the write-time wall with its hash-bound typed path");
  await assessMetricIndependentHuman(owner, { cell: lawful[0] }); const replayed = (await rootQuery("select matches,observed_status,observed_numerator,observed_denominator,details from clara.metric_cell_assessments where cell_id=$1 order by assessed_at desc limit 1", [lawful[0]])).rows[0];
  assert.deepEqual([replayed.matches, replayed.observed_status, String(replayed.observed_numerator), String(replayed.observed_denominator), replayed.details.observed_displayed_text], [true, cellA.cell_status, String(cellA.exact_numerator), String(cellA.exact_denominator), cellA.displayed_text], "the independent walker reproduces a definitionless composition without ever loading a definition version");
  const rootPeriodId = (await rootQuery("select period_id from clara.metric_evaluation_context_periods where context_id=$1 order by ordinal limit 1", [cellA.evaluation_context_id])).rows[0].period_id;
  for (const [tag, node] of [["null_node", null], ["unregistered_node", JSON.stringify({ node: "literal_injection" })], ["non_object_node", JSON.stringify("measure")]]) { const guard = await caught(() => rootQuery("select clara._metric_recheck_node_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,false,'avg_month_end_v1',null) r", [clientA, contextA.snapshot_id, cellA.evaluation_context_id, rootPeriodId, node]));
    assert.equal(guard?.code, "CLR10", `${tag}: ${guard?.code} ${guard?.message}`); assert.match(guard.message, /malformed or unregistered node/i, tag); assert.equal(reasonOf(guard), "unknown_field", `${tag}: ${guard?.detail}`); }
});
await t.test("raw assessment isolates non-finite and evaluator-identity walls", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "assessment-integrity"); await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(3) });
  const version = await approvedDefinition(owner, { client, key: `assessment_${randomUUID()}`, unit: "money", ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }) });
  const cell = await evaluate(owner, { client, version, periods: [fx.period], snapshotId: fx.snapshotId });
  const checker = (await rootQuery("select * from clara.evaluator_versions where evaluator_name='assess_metric_cell_independent' and version=1")).rows[0];
  const sql = `insert into clara.metric_cell_assessments(firm_id,client_id,cell_id,evaluator_version_id,observed_status,
    observed_numerator,observed_denominator,matches,assessed_by,details) values($1,$2,$3,$4,'ok',$5,$6,false,$7,'{}')`;
  const identities = [["name", "wrong_checker", checker.entrypoint_signature, true], ["signature", checker.evaluator_name, "clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)", true], ["deployment", checker.evaluator_name, checker.entrypoint_signature, false]];
  for (const [tag, name, signature, deploy] of identities) { const invented = await expectFnOwnerActionRefusal(async (db) => { const id = randomUUID();
      const members = [signature, "clara._metric_recheck_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)"];
      const rows = (await db.query(`select s,sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')) h from unnest($1::text[])with ordinality q(s,o) order by o`, [members])).rows;
      const closure = (await db.query("select sha256(convert_to(string_agg(encode(h,'hex'),'' order by o),'UTF8')) h from unnest($1::bytea[])with ordinality q(h,o)", [rows.map((row) => row.h)])).rows[0].h;
      await db.query(`insert into clara.evaluator_versions(id,evaluator_name,version,entrypoint_signature,closure_sha256,migration_version,deployed) values($1,$2,99,$3,$4,'test',false)`, [id, name, signature, closure]);
      for (let i = 0; i < members.length; i += 1) await db.query(`insert into clara.evaluator_version_members(evaluator_version_id,ordinal,member_signature,body_sha256) values($1,$2,$3,$4)`, [id, i, members[i], rows[i].h]);
      if (deploy) { await db.query("reset role"); assert.deepEqual((await db.query("select current_user,session_user")).rows[0], { current_user: (await db.query("select session_user u")).rows[0].u, session_user: (await db.query("select session_user u")).rows[0].u }); await db.query("update clara.evaluator_versions set deployed=true where id=$1", [id]); await db.query(`set role ${ROLES.fnOwner}`); }
      await db.query(sql, [cell.firm_id, client, cell.id, id, 1, 1, owner]); await db.query("set constraints all immediate"); });
    assert.equal(invented.code, "CLR11", tag); assert.match(invented.message, /independent evaluator identity/i, tag); }
  const missingMember = await expectFnOwnerActionRefusal(async (db) => { const id = randomUUID(); await db.query(`insert into clara.evaluator_versions(id,evaluator_name,version,entrypoint_signature,closure_sha256,migration_version,deployed) values($1,$2,99,$3,sha256(convert_to('empty','UTF8')),'test',false)`, [id, checker.evaluator_name, checker.entrypoint_signature]); await db.query("reset role"); await db.query("update clara.evaluator_versions set deployed=true where id=$1", [id]); });
  assert.equal(missingMember.code, "CLR10"); assert.match(missingMember.message, /closure incomplete/i);
  for (const [tag, evaluator, numerator, denominator] of [["nan", checker.id, "NaN", 1], ["infinity", checker.id, 1, "Infinity"], ["negative_infinity", checker.id, "-Infinity", 1], ["unknown", checker.id, 1, null], ["primary", cell.evaluator_version_id, 1, 1]]) { const error = await expectFnOwnerInsertRefusal(sql, [cell.firm_id, client, cell.id, evaluator, numerator, denominator, owner]); assert.match(`${error.message} ${error.detail ?? ""}`, /assessment|finite|numeric|evaluator|check/i, tag); }
});
await t.test("provenance asserts this test's new cell across ten groups and fourteen atoms", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "provenance");
  await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(4), cents: 100_000 });
  const version = await approvedDefinition(owner, {
    client, key: `provenance_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  const cell = await evaluate(owner, { client, version, periods: [fx.period], snapshotId: fx.snapshotId });
  const counts = {};
  for (const [atom, table] of Object.entries({
    periods: "metric_cell_periods", snapshots: "metric_cell_snapshots", account_sets: "metric_cell_account_sets",
    constants: "metric_cell_constants", entries: "metric_cell_entries", documents: "metric_cell_documents",
    presentation_maps: "metric_cell_presentation_maps",
  })) counts[atom] = (await rootQuery(`select count(*)::int n from clara.${table} where cell_id=$1`, [cell.id])).rows[0].n;
  const watermark = (await rootQuery(
    `select s.books_watermark from clara.metric_cell_snapshots cs
      join clara.metric_input_snapshots s on s.id=cs.snapshot_id where cs.cell_id=$1`, [cell.id],
  )).rows;
  const periods = (await rootQuery(
    `select cp.period_id,rp.id as reporting_period_id from clara.metric_cell_periods cp
      left join clara.reporting_periods rp on rp.id=cp.period_id where cp.cell_id=$1`, [cell.id],
  )).rows;
  assert.ok(periods.length > 0, "the cell binds at least one reporting period");
  assert.ok(periods.every((row) => row.reporting_period_id === row.period_id),
    "every positive period provenance atom resolves to the live reporting-period identity");
  const manifest = cell.inputs?.normalized_provenance; assert.deepEqual([manifest.period_ids, manifest.snapshot_ids, manifest.constant_version_ids, manifest.presentation_map_version_ids], [[fx.period.id], [fx.snapshotId], [], []]); for (const [key, table, column] of [["account_set_version_ids", "account_sets", "account_set_version_id"], ["entry_ids", "entries", "entry_id"], ["document_ids", "documents", "document_id"]]) assert.deepEqual(manifest[key], (await rootQuery(`select ${column} from clara.metric_cell_${table} where cell_id=$1 order by 1`, [cell.id])).rows.map((row) => row[column]), key);
  const na = {
    ...(cell.inputs?.provenance_not_applicable ?? {}),
    ...(cell.inputs?.not_applicable ?? {}),
  };
  const versionedNA = (atom, column = null) => {
    const value = na[atom] ?? column;
    return !!value && typeof value === "object" && Number(value.version) > 0;
  };
  const groups = {
    definition: { definition_version: !!cell.definition_version_id, normalized_formula_hash: !!cell.formula_sha256 },
    periods: { periods: counts.periods > 0 },
    catalog_versions: { account_set_versions: counts.account_sets > 0, presentation_map_versions: counts.presentation_maps > 0 || versionedNA("presentation_map_versions") },
    inputs_and_references: { input_values: cell.inputs?.input_values?.node === "measure" && cell.inputs.input_values.account_set_resolution?.set_key === "revenue" && String(cell.inputs.input_values.value?.numerator) === "100000" && String(cell.inputs.input_values.value?.denominator) === "1", entry_document_references: counts.entries > 0 && (counts.documents > 0 || versionedNA("documents")) },
    books_watermark: { books_watermark: !!cell.books_watermark && watermark.length > 0 && watermark.every((row) => row.books_watermark === cell.books_watermark) },
    evaluator: { evaluator_version: !!cell.evaluator_version_id },
    result_and_rounding: { exact_result: cell.exact_numerator != null && cell.exact_denominator != null, displayed_rounding: cell.displayed_scale != null && cell.displayed_text != null },
    model_proposal: { model_proposal: !!cell.model_proposal_id || versionedNA("model_proposal", cell.model_proposal_provenance) },
    human_approval: { human_approval: !!cell.human_approval_id || versionedNA("human_approval", cell.human_approval_provenance) },
    supersession: { supersession: !!cell.supersedes_cell_id || versionedNA("supersession") },
  };
  const atoms = Object.entries(groups).flatMap(([group, values]) => Object.entries(values).map(([atom, present]) => ({ group, atom, present })));
  assert.equal(Object.keys(groups).length, 10); assert.equal(atoms.length, 14, atoms.map(({ atom }) => atom).join(", "));
  assert.deepEqual(atoms.filter(({ present }) => !present), [], JSON.stringify({ atoms, na })); assert.ok(Object.values(na).every((value) => typeof value === "object" && Number(value.version) > 0), JSON.stringify(na));
  for (const table of ["periods", "snapshots", "account_sets", "entries", "documents"]) { if (!counts[table]) continue;
    const error = await expectFnOwnerActionRefusal(async (db) => { const freshContext = randomUUID(), freshRun = randomUUID(); await db.query("set constraints clara.t_metric_context_integrity,clara.t_metric_cell_integrity deferred"); await db.query(`insert into clara.metric_evaluation_contexts(id,firm_id,client_id,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by)select $2,firm_id,client_id,snapshot_id,evaluator_version_id,$3,context_sha256,created_by from clara.metric_evaluation_contexts where id=$1`, [cell.evaluation_context_id, freshContext, freshRun]); await db.query(`insert into clara.metric_evaluation_context_periods(context_id,snapshot_id,firm_id,client_id,period_id,period_start,period_end,ordinal)select $2,snapshot_id,firm_id,client_id,period_id,period_start,period_end,ordinal from clara.metric_evaluation_context_periods where context_id=$1`, [cell.evaluation_context_id, freshContext]); const minted = await db.query(`insert into clara.metric_cells(firm_id,client_id,run_id,evaluation_context_id,definition_version_id,formula_sha256,resolved_inputs_sha256,evaluator_version_id,books_watermark,cell_status,na_reason_version_id,exact_numerator,exact_denominator,unit_key,displayed_scale,displayed_text,inputs,model_proposal_provenance,human_approval_provenance)select firm_id,client_id,$2,$3,definition_version_id,formula_sha256,resolved_inputs_sha256,evaluator_version_id,books_watermark,cell_status,na_reason_version_id,exact_numerator,exact_denominator,unit_key,displayed_scale,displayed_text,inputs,model_proposal_provenance,human_approval_provenance from clara.metric_cells where id=$1 returning id`, [cell.id, freshRun, freshContext]); const fresh = minted.rows[0].id; for (const child of ["periods", "snapshots", "account_sets", "constants", "entries", "documents", "presentation_maps"]) { if (child === table) continue; const column = { periods: "period_id,period_start,period_end,ordinal", snapshots: "snapshot_id", account_sets: "account_set_version_id", constants: "constant_version_id", entries: "entry_id", documents: "document_id", presentation_maps: "presentation_map_version_id" }[child]; await db.query(`insert into clara.metric_cell_${child}(cell_id,firm_id,client_id,${column})select $2,firm_id,client_id,${column} from clara.metric_cell_${child} where cell_id=$1`, [cell.id, fresh]); } await db.query("set constraints all immediate"); }); assert.equal(error?.code, "CLR11", table); assert.match(error.message, /normalized provenance.*reconstruct/i, table); }
}); }
