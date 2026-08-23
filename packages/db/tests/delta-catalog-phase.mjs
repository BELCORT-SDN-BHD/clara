import assert from "node:assert/strict"; import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, wakeQuery, withActor, ROLES, PG, buildWorld, addMember, insertUser, mintInteractive,
  requireWaveEDelta, DELTA_RELATIONS, DELTA_ENTRYPOINTS, exactEntrypoint, caught, reasonOf,
  freshDeltaClient, pastMonthStart, addMonths, mintPeriodWithMovement, createStandardSets, upsertAccountClassed,
  proposeMetricDefinition, approveMetricDefinition, rejectMetricDefinition, supersedeMetricDefinition,
  assertThreeRevisionBackwardRefusal, mintMetricInput, evaluateMetricHuman,
  firmIdOf, assertSnapshotForgeryRefusals, measure, metricAst,
} from "./delta-fixtures.mjs";
let world;
export async function registerCatalogPhase(t) { await requireWaveEDelta(); world = await buildWorld();
await t.test("readiness pins the complete relation family and every lifecycle/evaluator signature", async () => {
  for (const relation of DELTA_RELATIONS) {
    assert.equal((await rootQuery("select to_regclass($1) is not null as ok", [`clara.${relation}`])).rows[0].ok,
      true, `clara.${relation} exists`);
  }
  for (const [name, signature] of DELTA_ENTRYPOINTS) {
    const observed = await exactEntrypoint(name);
    assert.equal(observed.signature.startsWith("clara.") ? observed.signature : `clara.${observed.signature}`, signature);
  }
});
await t.test("stable UUID account identity backs frozen account-set membership", async () => {
  const columns = (await rootQuery(
    `select table_name,column_name,data_type,is_nullable from information_schema.columns
      where table_schema='clara' and table_name in
        ('coa_accounts','account_sets','account_set_versions','account_set_version_members','metric_definitions','metric_definition_versions','metric_cells')`,
  )).rows;
  const byName = new Map(columns.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  for (const key of ["coa_accounts.account_id", "account_sets.id", "account_set_versions.id",
    "account_set_version_members.account_id", "metric_definitions.id", "metric_definition_versions.id",
    "metric_cells.id", "metric_cells.definition_version_id"]) {
    assert.equal(byName.get(key)?.data_type, "uuid", `${key} is UUID identity`);
  }
  assert.equal(byName.get("coa_accounts.account_id")?.is_nullable, "NO");
  assert.equal(byName.has("metric_cells.account_code"), false);
  const constraints = (await rootQuery(
    `select conrelid::regclass::text relation,contype,pg_get_constraintdef(oid) definition
       from pg_constraint where conrelid in
         ('clara.coa_accounts'::regclass,'clara.account_set_version_members'::regclass)`,
  )).rows;
  assert.ok(constraints.some((row) => row.relation === "clara.coa_accounts" && row.contype === "u" && /account_id/.test(row.definition)));
  assert.ok(constraints.some((row) => row.relation === "clara.account_set_version_members" && row.contype === "f" && /account_id/.test(row.definition)));
  const existing = (await rootQuery(
    `select client_id,account_code,name,account_type,account_class,special_acc_type,is_active,account_id
       from clara.coa_accounts order by created_at,client_id,account_code offset 2 limit 1`,
  )).rows[0];
  assert.ok(existing, "deploy-onto-existing retained a pre-delta chart row");
  assert.ok(existing.account_id, "deploy-onto-existing backfilled stable UUID identity");
  const reread = (await rootQuery(
    `select client_id,account_code,name,account_type,account_class,special_acc_type,is_active,account_id
       from clara.coa_accounts where account_id=$1`, [existing.account_id],
  )).rows[0];
  assert.deepEqual(reread, existing, "backfill preserves every pre-existing chart attribute");
  const err = await caught(() => rootQuery("update clara.coa_accounts set account_id=gen_random_uuid() where account_id=$1", [existing.account_id]));
  assert.equal(err?.code, "CLR08");
});
await t.test("primitive snapshots cover GL, open items, allocations, and time samples", async () => {
  const rows = (await rootQuery(
    `select c.relname,string_agg(a.attname,',' order by a.attnum) columns
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where n.nspname='clara' and c.relname=any($1::text[]) group by c.relname order by c.relname`,
    [["metric_input_snapshot_contributions", "metric_input_snapshot_open_items",
      "metric_input_snapshot_allocations", "metric_input_snapshot_samples"]],
  )).rows;
  assert.equal(rows.length, 4);
  const corpus = rows.map((row) => `${row.relname}:${row.columns}`).join("\n");
  for (const atom of ["journal_line_id", "entry_id", "account_id", "debit_cents", "credit_cents",
    "item_id", "counterparty_id", "allocation_id", "effective_date", "sample_ordinal"]) {
    assert.match(corpus, new RegExp(`\\b${atom}\\b`), `primitive corpus carries ${atom}`);
  }
  const moneyTypes = (await rootQuery(
    `select data_type from information_schema.columns where table_schema='clara'
      and table_name like 'metric_input_snapshot_%'
      and column_name in ('debit_cents','credit_cents','amount_cents','balance_cents')`,
  )).rows;
  assert.ok(moneyTypes.length >= 5 && moneyTypes.every((row) => row.data_type === "bigint"));
});
await t.test("primitive snapshots capture authoritative-0009 codes and only requested-period movement", async () => {
  const owner = world.users.alice, client = await freshDeltaClient(owner, "source-period-scope"), accountCode = "123-AB";
  await upsertAccountClassed(owner, { client, code: accountCode, name: "Hyphenated snapshot asset", type: "asset" });
  const account = (await rootQuery("select account_id,account_code from clara.coa_accounts where client_id=$1 and account_code=$2", [client, accountCode])).rows[0];
  assert.equal(account?.account_code, accountCode, "the governed upsert positively returns a valid authoritative-0009 account");
  const janStart = await pastMonthStart(12), febStart = addMonths(janStart, 1), marStart = addMonths(janStart, 2);
  const jan = await mintPeriodWithMovement(owner, { client, monthStart: janStart, debit: accountCode, cents: 100_000 });
  const feb = await mintPeriodWithMovement(owner, { client, monthStart: febStart, debit: accountCode, cents: 200_000 });
  const mar = await mintPeriodWithMovement(owner, { client, monthStart: marStart, debit: accountCode, cents: 300_000 });
  const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [jan.period.id, mar.period.id] });
  const contributions = (await rootQuery(
    `select entry_id,bound_period_id,posting_date from clara.metric_input_snapshot_contributions
      where snapshot_id=$1 order by posting_date,entry_id`, [snapshotId],
  )).rows;
  assert.ok(contributions.some((row) => row.entry_id === jan.entry && row.bound_period_id === jan.period.id));
  assert.ok(contributions.some((row) => row.entry_id === mar.entry && row.bound_period_id === mar.period.id));
  assert.equal(contributions.some((row) => row.entry_id === feb.entry || row.bound_period_id === feb.period.id), false,
    "the unrequested February movement contributes nothing");
  const samples = (await rootQuery(
    `select period_id,account_id,account_code,balance_cents from clara.metric_input_snapshot_samples
      where snapshot_id=$1 and account_id=$2 and sample_date=period_end order by sample_date`, [snapshotId, account.account_id],
  )).rows;
  assert.deepEqual(samples, [
    { period_id: jan.period.id, account_id: account.account_id, account_code: accountCode, balance_cents: "100000" },
    { period_id: mar.period.id, account_id: account.account_id, account_code: accountCode, balance_cents: "600000" },
  ], "requested-month samples preserve stable account identity, immutable hyphenated code, and cumulative approved movement");
});
await t.test("raw snapshot facts and headers reject scalar forgery", async () =>
  assertSnapshotForgeryRefusals(world.users.alice));
await t.test("metric approval enforces distinct humans except a genuinely solo firm with attestation", async () => {
  const multiOwner = world.users.dave;
  const multiApprover = await insertUser(world.prefix, `delta_owner_${randomUUID().slice(0, 8)}`);
  await addMember(multiOwner, {
    firm: world.firms.B, user: multiApprover, role: "owner", opKey: `delta-owner-${randomUUID()}`,
  });
  const multiClient = await freshDeltaClient(multiOwner, "approval-multi");
  await createStandardSets(multiOwner, multiClient);
  const multiVersion = await proposeMetricDefinition(multiOwner, {
    client: multiClient, key: `approval_multi_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  const selfErr = await caught(() => approveMetricDefinition(multiOwner, multiVersion, {
    attestation: "I am supplying an attestation despite another eligible human existing",
  }));
  assert.ok(selfErr, "a proposer cannot self-approve when another eligible human exists");
  assert.equal((await rootQuery(
    "select state from clara.metric_definition_versions where id=$1", [multiVersion],
  )).rows[0].state, "draft");
  await approveMetricDefinition(multiApprover, multiVersion, { attestation: null });
  assert.equal((await rootQuery(
    "select approved_by,state from clara.metric_definition_versions where id=$1", [multiVersion],
  )).rows[0].approved_by, multiApprover);
  const soloOwner = world.users.erin;
  const soloClient = await freshDeltaClient(soloOwner, "approval-solo");
  await createStandardSets(soloOwner, soloClient);
  const soloVersion = await proposeMetricDefinition(soloOwner, {
    client: soloClient, key: `approval_solo_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  const blankErr = await caught(() => approveMetricDefinition(soloOwner, soloVersion, { attestation: "  " }));
  assert.ok(blankErr, "a solo proposer still needs an explicit nonblank attestation");
  assert.equal((await rootQuery(
    "select state from clara.metric_definition_versions where id=$1", [soloVersion],
  )).rows[0].state, "draft");
  await approveMetricDefinition(soloOwner, soloVersion, { attestation: "sole eligible human approval" });
  const soloRow = (await rootQuery(
    "select state,self_approval_attestation from clara.metric_definition_versions where id=$1", [soloVersion],
  )).rows[0];
  assert.deepEqual(soloRow, { state: "firm_approved", self_approval_attestation: "sole eligible human approval" });
});
await t.test("metric definition lifecycle rejects drafts and supersedes only forward within one lineage", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "lifecycle");
  const otherClient = await freshDeltaClient(owner, "lifecycle-other");
  await createStandardSets(owner, client);
  await createStandardSets(owner, otherClient);
  const rejected = await proposeMetricDefinition(owner, {
    client, key: `reject_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await rejectMetricDefinition(owner, rejected);
  const rejectedRow = (await rootQuery(
    "select state,approved_at,approved_formula_sha256 from clara.metric_definition_versions where id=$1", [rejected],
  )).rows[0];
  assert.deepEqual(rejectedRow, { state: "rejected", approved_at: null, approved_formula_sha256: null });
  assert.ok(await caught(() => approveMetricDefinition(owner, rejected)), "a rejected version cannot be approved later");
  const lineageKey = `lineage_${randomUUID()}`;
  const predecessor = await proposeMetricDefinition(owner, {
    client, key: lineageKey, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, predecessor);
  const successor = await proposeMetricDefinition(owner, {
    client, key: lineageKey, unit: "money",
    ast: metricAst({ root: { node: "sum", terms: [measure({ set: "revenue" })] }, unit: "money" }),
  });
  await approveMetricDefinition(owner, successor);
  const before = (await rootQuery(
    "select id,definition_id,ast,normalized_ast,formula_sha256 from clara.metric_definition_versions where id=any($1::uuid[]) order by revision",
    [[predecessor, successor]],
  )).rows;
  assert.equal(before.length, 2);
  await supersedeMetricDefinition(owner, { predecessor, successor });
  const afterRows = (await rootQuery(
    `select id,definition_id,state,supersedes_version_id,ast,normalized_ast,formula_sha256
       from clara.metric_definition_versions where id=any($1::uuid[]) order by revision`,
    [[predecessor, successor]],
  )).rows;
  const prior = afterRows.find((row) => row.id === predecessor);
  const next = afterRows.find((row) => row.id === successor);
  assert.equal(prior.state, "superseded");
  assert.equal(next.supersedes_version_id, predecessor);
  assert.equal(next.definition_id, prior.definition_id);
  for (const row of afterRows) {
    const original = before.find((candidate) => candidate.id === row.id);
    assert.deepEqual({ ast: row.ast, normalized_ast: row.normalized_ast, formula_sha256: row.formula_sha256 },
      { ast: original.ast, normalized_ast: original.normalized_ast, formula_sha256: original.formula_sha256 });
  }
  assert.ok(await caught(() => supersedeMetricDefinition(owner, { predecessor: successor, successor: predecessor })),
    "the lifecycle cannot be reversed");
  await assertThreeRevisionBackwardRefusal(owner, { client, key: lineageKey, predecessor, successor });
  const foreign = await proposeMetricDefinition(owner, {
    client: otherClient, key: `foreign_${randomUUID()}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, foreign);
  assert.ok(await caught(() => supersedeMetricDefinition(owner, { predecessor: successor, successor: foreign })),
    "cross-client or cross-definition supersession refuses");
});
await t.test("formula normalization is canonical across commutative order and JSON object-key order", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "canonical-formula");
  await createStandardSets(owner, client);
  const left = measure({ set: "revenue" });
  const right = measure({ set: "expense" });
  const key = `canonical_${randomUUID()}`;
  const first = await proposeMetricDefinition(owner, {
    client, key, unit: "money",
    ast: metricAst({ root: { node: "sum", terms: [left, right] }, unit: "money" }),
  });
  const reorderedRoot = {
    terms: [{ scope: right.scope, present_as: right.present_as, aspect: right.aspect,
      set: { kind: "account_set", key: "expense" }, node: "measure" }, left],
    node: "sum",
  };
  const second = await proposeMetricDefinition(owner, {
    client, key, unit: "money",
    ast: { root: reorderedRoot, edge_policy_set: "eps_v1", result_scale: 4,
      temporality: "flow", unit: "money", ast: "clara.metric/v1" },
  });
  const rows = (await rootQuery(
    `select id,normalized_ast,encode(formula_sha256,'hex') formula_hash
       from clara.metric_definition_versions where id=any($1::uuid[])`, [[first, second]],
  )).rows;
  assert.equal(rows.length, 2);
  assert.equal((await rootQuery(
    "select count(distinct definition_id)::int n from clara.metric_definition_versions where id=any($1::uuid[])",
    [[first, second]],
  )).rows[0].n, 1, "the equivalents are revisions in one definition lineage");
  assert.deepEqual(rows[0].normalized_ast, rows[1].normalized_ast,
    "commutative and JSON key-order equivalents normalize identically");
  assert.equal(rows[0].formula_hash, rows[1].formula_hash,
    "normalized-equivalent formulas have one deterministic identity hash");
});
await t.test("canonical product seeds carry the ten semantic formula families, not name-only zeroes", async () => {
  const rows = (await rootQuery(`select d.definition_key,v.ast from clara.metric_definitions d
    join clara.metric_definition_versions v on v.definition_id=d.id where d.firm_id is null and v.state='canonical'`)).rows;
  const expected = new Map([[
    "current_ratio", ["divide", "current_assets", "current_liabilities"]], ["quick_ratio", ["divide", "quick_assets", "current_liabilities"]],
  ["gross_margin", ["divide", "subtract", "revenue", "cost_of_sales"]], ["net_margin", ["divide", "subtract", "revenue", "expenses"]],
  ["revenue_growth", ["percent_change", "lag", "revenue"]], ["debtor_days", ["multiply", "divide", "average", "trade_debtors", "days_in_period"]],
  ["creditor_days", ["multiply", "divide", "average", "trade_creditors", "days_in_period"]], ["stock_turnover", ["divide", "average", "cost_of_sales", "inventory"]],
  ["gearing", ["divide", "borrowings", "equity"]], ["expense_to_revenue", ["divide", "expenses", "revenue"]]]);
  assert.deepEqual(rows.map((row) => row.definition_key).sort(), [...expected.keys()].sort());
  for (const row of rows) {
    const corpus = JSON.stringify(row.ast.root);
    for (const token of expected.get(row.definition_key)) assert.match(corpus, new RegExp(`"(?:node|key)":"${token}"`), `${row.definition_key}:${token}`);
    assert.doesNotMatch(corpus, /"node":"constant","key":"zero"/);
  }
});
await t.test("closed AST refuses at proposal without draft or idempotency residue; evaluator has no float path", async () => {
  const owner = world.users.alice;
  const client = await freshDeltaClient(owner, "catalog-validator");
  await createStandardSets(owner, client);
  for (const [key, ast, reason] of [
    [`unknown_${randomUUID()}`, metricAst({ root: measure({ set: "revenue" }), unit: "money", extra: { unknown_contract_breaker: true } }), "unknown_field"],
    [`literal_${randomUUID()}`, metricAst({ root: { node: "literal", value: 1 } }), "numeric_literal_forbidden"],
  ]) {
    const opKey = `delta-invalid-${randomUUID()}`;
    const err = await caught(() => proposeMetricDefinition(owner, { client, key, unit: ast.unit, ast, opKey }));
    assert.equal(reasonOf(err), reason, `${err?.code} ${err?.message} ${err?.detail}`);
    const residue = (await rootQuery(`select count(distinct d.id)::int definitions,count(v.id)::int versions
      from clara.metric_definitions d left join clara.metric_definition_versions v on v.definition_id=d.id
      where d.firm_id=(select firm_id from clara.clients where id=$1) and d.definition_key=$2`, [client, key])).rows[0];
    assert.deepEqual(residue, { definitions: 0, versions: 0 });
    assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='propose_metric_definition' and op_key=$1", [opKey])).rows[0].n, 0);
    const fixed = metricAst({ root: measure({ set: "revenue" }), unit: "money" });
    assert.ok(await proposeMetricDefinition(owner, { client, key, unit: "money", ast: fixed, opKey }),
      "the corrected retry reuses the same op key because validation reserved nothing");
  }
  const bodies = (await rootQuery(
    `select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) body
       from pg_proc p where p.pronamespace='clara'::regnamespace
        and (p.proname like 'evaluate_metric_v%' or p.proname like '%metric%valid%'
          or p.proname='assess_metric_cell_independent_v1')`,
  )).rows;
  assert.ok(bodies.length >= 2);
  for (const row of bodies) assert.doesNotMatch(row.body,
    /\b(?:float4|float8|real)\b|\bdouble\s+precision\b|::\s*float/i,
    `${row.signature} has no floating-point path`);
});
await t.test("undeployed evaluators refuse execution and do not claim an ineffective current-call timeout", async () => {
  for (const name of ["evaluate_metric_v1", "evaluate_fs_pack_v1", "assess_metric_cell_independent_v1"])
    assert.doesNotMatch((await exactEntrypoint(name)).definition, /set_config\s*\(\s*'(?:statement_timeout|clara\.evaluator_deploy_permit)'|current_setting\s*\(\s*'clara\.evaluator_deploy_permit'|\bset\s+(?:local\s+)?statement_timeout/i);
  const owner = world.users.alice, client = await freshDeltaClient(world.users.alice, "undeployed-evaluator");
  await createStandardSets(owner, client);
  const fx = await mintPeriodWithMovement(owner, { client, monthStart: await pastMonthStart(3) });
  const version = await proposeMetricDefinition(owner, { client, key: `undeployed_${randomUUID()}`, unit: "money", ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }) });
  await approveMetricDefinition(owner, version);
  const error = await caught(() => evaluateMetricHuman(owner, { client, definitionVersion: version, periodIds: [fx.period.id], snapshotId: fx.snapshotId }));
  assert.ok(error, "evaluation refuses before the ceremony deploys its evaluator closure");
  assert.match(`${error.message} ${error.detail ?? ""}`, /evaluator|deploy/i);
  const packRun = randomUUID(), packError = await caught(() => humanQuery(owner, "select clara.evaluate_fs_pack_v1($1,$2,$3,$4,$5)", [client, [version], [fx.period.id], fx.snapshotId, packRun]));
  assert.ok(packError, "pack evaluation refuses before the ceremony deploys its evaluator closure"); assert.match(`${packError.message} ${packError.detail ?? ""}`, /evaluator|deploy/i);
  assert.equal((await rootQuery("select count(*)::int n from clara.op_receipts where fn='evaluate_fs_pack_v1' and op_key=$1", [packRun])).rows[0].n, 0);
  assert.equal((await rootQuery("select count(*)::int n from clara.metric_cells where definition_version_id=$1", [version])).rows[0].n, 0);
  const rollback = await caught(() => withActor({ transaction: true }, async (db) => {
    const primary = (await db.query("select id from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=1")).rows[0].id;
    const checker = (await db.query("select id from clara.evaluator_versions where evaluator_name='assess_metric_cell_independent' and version=1")).rows[0].id;
    await db.query("update clara.evaluator_versions set deployed=true where id=$1", [primary]);
    await db.query(`set role ${ROLES.authenticated}`); await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: owner, role: "authenticated" })]);
    const receipt = await db.query("select clara.evaluate_metric_v1($1,$2,$3,$4,$5) r", [client, version, [fx.period.id], fx.snapshotId, randomUUID()]);
    const cellId = receipt.rows[0].r.cell_id;
    await db.query("set constraints all immediate");
    const assessmentError = await caught(() => db.query("select clara.assess_metric_cell_independent_v1($1,$1,$2)", [cellId, `predeploy-${randomUUID()}`]));
    const rollback = new Error("rollback pre-ceremony fixture"); rollback.fixture = { cellId, checker, assessmentError }; throw rollback;
  }));
  assert.ok(rollback?.fixture, `pre-ceremony assessment fixture reaches its rollback sentinel (${rollback?.code ?? "no code"}: ${rollback?.message ?? "none"})`);
  const { cellId, checker, assessmentError } = rollback.fixture ?? {};
  assert.ok(assessmentError, "independent assessment refuses before its evaluator is deployed");
  assert.match(`${assessmentError.message} ${assessmentError.detail ?? ""}`, /evaluator|deploy/i);
  assert.equal((await rootQuery("select count(*)::int n from clara.metric_cell_assessments where cell_id=$1 or evaluator_version_id=$2", [cellId, checker])).rows[0].n, 0);
});
await t.test("forced RLS carries owner and human policy pairs on all 38 delta tables", async () => {
  const rows = (await rootQuery(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname=any($1::text[]) order by c.relname`,
    [DELTA_RELATIONS],
  )).rows;
  assert.equal(rows.length, DELTA_RELATIONS.length);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS forced`);
    const policies = (await rootQuery(
      "select roles,cmd,qual from pg_policies where schemaname='clara' and tablename=$1", [row.relname],
    )).rows;
    assert.ok(policies.some((policy) => policy.roles.includes("clara_fn_owner") && policy.cmd === "ALL"));
    assert.ok(policies.some((policy) => policy.roles.includes("clara_authenticated") && policy.cmd === "SELECT" && /jwt_firm/.test(policy.qual ?? "")));
  }
  const firmA = (await rootQuery("select firm_id from clara.clients where id=$1", [world.clients.A1])).rows[0].firm_id;
  const firmB = (await rootQuery("select firm_id from clara.clients where id=$1", [world.clients.B1])).rows[0].firm_id;
  const visible = await humanQuery(world.users.alice,
    "select count(*) filter(where firm_id=$1)::int own,count(*) filter(where firm_id=$2)::int other from clara.metric_input_snapshots",
    [firmA, firmB]);
  assert.equal(visible.rows[0].other, 0);
  assert.ok(visible.rows[0].own > 0, "the authenticated lane positively sees its own firm corpus");
});
await t.test("application roles have no direct DML; agent reads only the exact catalog allowlist", async () => {
  const applicationRoles = [ROLES.authenticated, ROLES.agentRo, ROLES.runtime,
    ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const table of DELTA_RELATIONS) {
    for (const role of applicationRoles) {
      assert.equal((await rootQuery(
        "select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE') ok",
        [role, `clara.${table}`],
      )).rows[0].ok, false, `${role} has no direct DML on clara.${table}`);
    }
  }
  const allowed = ["metric_definitions", "metric_definition_versions", "account_sets", "account_set_versions",
    "presentation_maps", "presentation_map_versions", "metric_constants", "edge_policy_sets", "metric_edge_policies"];
  const denied = DELTA_RELATIONS.filter((table) => !allowed.includes(table));
  const firmA = await firmIdOf(world.clients.A1), firmB = await firmIdOf(world.clients.B1);
  await rootQuery(`insert into clara.presentation_maps(firm_id,map_key,title) values($1,$2,'Delta RLS A'),($3,$4,'Delta RLS B')`, [firmA, `rls_a_${randomUUID()}`, firmB, `rls_b_${randomUUID()}`]);
  await rootQuery(`insert into clara.presentation_map_versions(firm_id,presentation_map_id,revision,content_sha256,effective_from,state)
    select firm_id,id,1,sha256(convert_to(id::text,'UTF8')),'2020-01-01','published' from clara.presentation_maps m where map_key like 'rls\\_%' escape '\\'
      and not exists(select 1 from clara.presentation_map_versions v where v.presentation_map_id=m.id)`);
  const firmScoped = new Set(["metric_definitions", "metric_definition_versions", "account_sets", "account_set_versions", "presentation_maps", "presentation_map_versions"]);
  for (const table of allowed) {
    assert.equal((await rootQuery("select has_table_privilege($1,$2,'SELECT') ok", [ROLES.agentRo, `clara.${table}`])).rows[0].ok, true);
    const nullable = (await rootQuery(`select is_nullable='YES' ok from information_schema.columns
      where table_schema='clara' and table_name=$1 and column_name='firm_id'`, [table])).rows[0].ok;
    const roots = (await rootQuery(`select count(*) filter(where firm_id is null)::int global,
      count(*) filter(where firm_id=$1)::int a,count(*) filter(where firm_id=$2)::int b from clara.${table}`, [firmA, firmB])).rows[0];
    if (firmScoped.has(table)) assert.ok(roots.a > 0 && roots.b > 0, `${table} has positive rows for both firms`); else assert.ok(roots.global > 0, `${table} has positive global reference rows`);
    for (const [firm, other, ownCount, foreignCount] of [[firmA, firmB, roots.a, roots.b], [firmB, firmA, roots.b, roots.a]]) {
      const cred = await mintInteractive(firm);
      const counts = (await wakeQuery(ROLES.agentRo, cred.secret,
        `select count(*) filter(where firm_id is null)::int global,count(*) filter(where firm_id=$1)::int own,
                count(*) filter(where firm_id=$2)::int other from clara.${table}`, [firm, other])).rows[0];
      assert.equal(counts.own, ownCount, `${table} exposes every own-firm row through a real agent JWT`);
      if (firmScoped.has(table)) assert.ok(foreignCount > 0, `${table} positively observes a foreign-firm row before testing concealment`);
      assert.equal(counts.other, 0, `${table} hides ${foreignCount} positively observed foreign rows`);
      if (nullable) assert.equal(counts.global, roots.global, `${table} exposes every global catalog row`);
    }
  }
  for (const table of denied) {
    assert.equal((await rootQuery("select has_table_privilege($1,$2,'SELECT') ok", [ROLES.agentRo, `clara.${table}`])).rows[0].ok, false);
    assert.equal((await caught(() => roleQuery(ROLES.agentRo, `select count(*) from clara.${table}`)))?.code, PG.insufficientPrivilege);
  }
});
// THE FOUR BODY PINS BELOW ARE A REVIEWED-BYTES CENSUS, not a checksum for its own sake: each says
// "this lifecycle writer is the exact body the review approved". A pin therefore moves only when the
// body legitimately moves, and moving one is a reviewed act in its own right.
//
// approve_metric_definition's pin moved at 0084 (Wave E lane eta, the B4 follow-up): maker/
// checker for an AGENT-authored draft is now measured against the human who DIRECTED the wake
// (proposal_evidence.on_behalf_of) rather than against clara.agent_user_id(), which is nobody's
// accountability. Without it a one-owner firm could never approve an agent draft; with the naive
// alternative a human could direct the agent and then approve its work. The other three pins are
// UNCHANGED and that is load-bearing evidence: 0084 replaces exactly one body, and the three
// untouched writers still hash to the values delta reviewed.
await t.test("writer APIs are authenticated-only security definers with pinned search_path", async () => {
  const curated = "(metric_units|metric_temporalities|metric_primitives|metric_na_reason_versions|metric_constants|edge_policy_sets|metric_edge_policies|averaging_policy_versions)", appRoles = [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, "clara_runtime_login", ROLES.wakeInteractive, ROLES.wakeProactive], rows = (await rootQuery(`select p.oid,p.oid::regprocedure::text signature,lower(p.prosrc) body,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha,(select count(*) from unnest($1::text[])r join pg_roles g on g.rolname=r where has_function_privilege(g.oid,p.oid,'EXECUTE')) app_access,(select count(*) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a left join pg_roles g on g.oid=a.grantee where a.privilege_type='EXECUTE'and a.grantee<>p.proowner and(a.grantee=0 or g.rolname is distinct from'clara_authenticated'or a.is_grantable)) wrong_acl from pg_proc p where p.pronamespace='clara'::regnamespace`, [appRoles])).rows, forbidden = rows.filter((row) => Number(row.app_access) > 0 && new RegExp(`(insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+clara\\.${curated}\\b`, "i").test(row.body)), definitions = rows.filter((row) => Number(row.app_access) > 0 && /(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\b/i.test(row.body)), expected = new Map([["approve_metric_definition(uuid,bytea,text,text,text)", "5d41f25323df20ec54b9bd9b1f1b73c33c360c79f15813a31b32f14c36f4cc93"], ["propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)", "446e78387e7fa3d7fb716bafbcd52cde080a064fe0481632bd6480c661f1d994"], ["reject_metric_definition(uuid,text,text)", "4ffec6c0d7526d063f710b13395c743d7ddbade977d1b1b96ee02943f232e35b"], ["supersede_metric_definition(uuid,uuid,text,text)", "204ce22f2653aa657d8bb835c3a2d24be947a03f69fad97274bb518165089222"]]); assert.deepEqual(forbidden, [], "no effectively app-executable writer reaches product-curated/global rows"); const bare = (signature) => signature.replace(/^clara\./, ""); assert.deepEqual(definitions.map((row) => bare(row.signature)).sort(), [...expected.keys()].sort()); for (const row of definitions) assert.deepEqual([Number(row.app_access), Number(row.wrong_acl), row.body_sha], [1, 0, expected.get(bare(row.signature))], `${row.signature} is the exact reviewed firm-scoped audited lifecycle body with authenticated-only execution`);
  for (const [name] of DELTA_ENTRYPOINTS.filter(([candidate]) => candidate !== "verify_evaluator_freeze")) {
    const row = await exactEntrypoint(name);
    assert.equal(row.prosecdef, true);
    assert.ok((row.proconfig ?? []).includes("search_path=clara, pg_temp"));
    // The two NON-INHERITING login shells are named explicitly: a group probe cannot answer for clara_agent_read_login (0006) or clara_wake_write_login (0009).
    for (const [role, expected] of [[ROLES.authenticated, true], [ROLES.agentRo, false], [ROLES.runtime, false], [ROLES.wakeInteractive, false], [ROLES.wakeProactive, false], ["clara_agent_read_login", false], ["clara_wake_write_login", false]]) {
      if (!(await rootQuery("select to_regrole($1) is not null ok", [role])).rows[0].ok) continue;
      assert.equal((await rootQuery("select has_function_privilege($1,$2::regprocedure,'EXECUTE') ok", [role, row.signature])).rows[0].ok, expected, `${role} on ${row.signature}`);
    }
  }
});
await t.test("snapshots, contexts, cells, assessments, and provenance are insert-once", async () => {
  const integrity = [["t_metric_input_snapshot_reconstruct", "metric_input_snapshots", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_input_period_reconstruct", "metric_input_snapshot_periods", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_input_contribution_reconstruct", "metric_input_snapshot_contributions", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_input_open_item_reconstruct", "metric_input_snapshot_open_items", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_input_allocation_reconstruct", "metric_input_snapshot_allocations", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_input_sample_reconstruct", "metric_input_snapshot_samples", "_tf_metric_input_snapshot_reconstruct"], ["t_metric_open_item_identity", "metric_input_snapshot_open_items", "_tf_metric_snapshot_fact_identity"], ["t_metric_allocation_identity", "metric_input_snapshot_allocations", "_tf_metric_snapshot_fact_identity"], ["t_metric_sample_identity", "metric_input_snapshot_samples", "_tf_metric_snapshot_fact_identity"], ["t_metric_contribution_identity", "metric_input_snapshot_contributions", "_tf_metric_contribution_identity"], ["t_metric_context_integrity", "metric_evaluation_contexts", "_tf_metric_context_integrity"], ["t_metric_cell_integrity", "metric_cells", "_tf_metric_cell_integrity"], ["t_metric_cell_period_context", "metric_cell_periods", "_tf_metric_cell_context_member"], ["t_metric_cell_snapshot_context", "metric_cell_snapshots", "_tf_metric_cell_context_member"], ["t_metric_assessment_integrity", "metric_cell_assessments", "_tf_metric_assessment_integrity"]];
  for (const [name, table, fn] of integrity) assert.equal((await rootQuery(`select count(*)::int n from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgname=$1 and t.tgrelid=$2::regclass and p.proname=$3 and not t.tgisinternal and t.tgdeferrable and t.tginitdeferred=($1='t_metric_context_integrity')`, [name, `clara.${table}`, fn])).rows[0].n, 1, `${name} exact trigger identity`);
  const tables = ["metric_input_snapshots", "metric_input_snapshot_periods", "metric_input_snapshot_contributions",
    "metric_input_snapshot_open_items", "metric_input_snapshot_allocations", "metric_input_snapshot_samples",
    "metric_evaluation_contexts", "metric_evaluation_context_periods", "metric_cells", "metric_cell_periods",
    "metric_cell_snapshots", "metric_cell_account_sets", "metric_cell_constants", "metric_cell_entries",
    "metric_cell_documents", "metric_cell_presentation_maps", "metric_cell_assessments", "metric_evaluation_attempt_receipts"];
  for (const table of tables) {
    const triggers = (await rootQuery(
      "select pg_get_functiondef(t.tgfoid) body from pg_trigger t where t.tgrelid=$1::regclass and not t.tgisinternal",
      [`clara.${table}`],
    )).rows;
    assert.ok(triggers.some((row) => /CLR08|append.only|historical|immutable/i.test(row.body)));
    assert.ok(triggers.some((row) => /truncate/i.test(row.body)));
  }
  const source = (await rootQuery("select id from clara.metric_input_snapshots order by id limit 1")).rows[0];
  assert.ok(source, "the live snapshot corpus supplies an insert-once target");
  for (const sql of ["update clara.metric_input_snapshots set dataset_sha256=dataset_sha256 where id=$1",
    "delete from clara.metric_input_snapshots where id=$1"]) {
    const err = await caught(() => withActor({ role: ROLES.fnOwner }, (db) => db.query(sql, [source.id])));
    assert.equal(err?.code, "CLR08");
  }
});
await t.test("both evaluator closures are exact, independent, and registered undeployed", async () => {
  const independentSignatures = ["clara.assess_metric_cell_independent_v1(uuid,uuid,text)", "clara._metric_recheck_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)"];
  // CLOSED-WORLD by design: this census pins EVERY registered closure, so a new evaluator has to
  // be named here rather than slipping past a count. F-A1 (Wave-F Track A, migrations 0091/0092)
  // registers two more — the witness-pair corroboration predicate and its identity leaf — and
  // they are added as ROSTERS, not as a bumped total, so the derived length below still measures
  // something. Both are born undeployed exactly like delta's, and the identity leaf appears
  // TWICE on purpose: once as ordinal 3 of the predicate's closure (a change there must break the
  // predicate's aggregate hash) and once as its own one-member closure (so
  // check-frozen-evaluators' clara.evaluate_* discovery covers its SOURCE at review time).
  const witnessSignatures = ["clara.evaluate_witness_identity_v1(uuid,uuid,boolean)"];
  // KEYED BY NAME **AND VERSION**, because a closure family can carry more than one. F-A2
  // (opener ①) registers evaluate_witness_fact_state VERSION 2 — the three-locks nil-tax arm —
  // beside the frozen v1, which stays registered and merely becomes unreachable. Keying on the
  // name alone silently merged the two versions' member rows into one interleaved list, so the
  // ordered-roster assertion compared a concatenation against a single closure and the aggregate
  // check hashed eight rows against v1's stored digest. Both are per-VERSION facts.
  const witnessFactStateClosure = (entrypoint) => [entrypoint,
    "clara._fact_hash(uuid,uuid,text,text,bigint)", "clara._normalize_invoice_cents(text)", ...witnessSignatures];
  // F-A8 PR-1 (Wave-F Track A, the internet lane, v3/IL-D20) registers evaluate_policy_source_value
  // AFTER F-A2, as its OWN one-member closure — the Tier-1 artifact-locator extractor, no helper
  // fan-out. Same closed-world discipline as the two rosters above: named here, not folded into a
  // bumped total.
  const expected = new Map([["evaluate_metric@v1", ["clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)", "clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)", "clara.validate_metric_ast_v1(jsonb)", "clara._validate_metric_node_v1(jsonb,integer)", "clara._metric_selector_account_ids(uuid,jsonb)", "clara._metric_input_dataset_v1(uuid,uuid,uuid[])", "clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)", "clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)", "clara._hash(jsonb)", "clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)"]], ["assess_metric_cell_independent@v1", independentSignatures],
    ["evaluate_witness_fact_state@v1", witnessFactStateClosure("clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)")],
    ["evaluate_witness_fact_state@v2", witnessFactStateClosure("clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)")],
    ["evaluate_witness_identity@v1", witnessSignatures],
    ["evaluate_policy_source_value@v1", ["clara.evaluate_policy_source_value_v1(text,uuid,jsonb)"]]]);
  const members = (await rootQuery(`select e.evaluator_name,e.version,e.deployed,m.ordinal,m.member_signature,encode(m.body_sha256,'hex') stored,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text,'UTF8')),'hex') live,encode(e.closure_sha256,'hex') aggregate from clara.evaluator_versions e join clara.evaluator_version_members m on m.evaluator_version_id=e.id order by e.evaluator_name,e.version,m.ordinal`)).rows;
  for (const [key, roster] of expected) {
    const rows = members.filter((row) => `${row.evaluator_name}@v${row.version}` === key);
    assert.deepEqual(rows.map((row) => row.member_signature), roster, `${key} exact ordered closure`);
    assert.ok(rows.every((row) => !row.deployed && row.stored === row.live), `${key} is exact and undeployed`);
    const aggregate = (await rootQuery("select encode(sha256(convert_to(string_agg(stored,'' order by ordinal),'UTF8')),'hex') h from jsonb_to_recordset($1::jsonb) as x(ordinal int,stored text)", [JSON.stringify(rows)])).rows[0].h;
    assert.equal(rows[0].aggregate, aggregate, `${key} aggregate equals ordered member hashes`);
  }
  assert.equal(members.length, [...expected.values()].reduce((n, roster) => n + roster.length, 0));
  const primary = await exactEntrypoint("evaluate_metric_v1");
  assert.match(primary.definition, /pg_advisory_xact_lock/i,
    "the run cap serializes competing public calls before counting persisted cells");
  assert.match(primary.definition, /count\(\*\).*metric_cells[\s\S]*>=\s*5000/i,
    "the evaluator enforces the 5,000 persisted-cell ceiling inside the serialized section");
  assert.match(primary.definition, /"reason"\s*:\s*"cost_exceeded"[\s\S]*"class"\s*:\s*"cells_per_run"[\s\S]*"limit"\s*:\s*5000/i,
    "the cap refusal exposes the exact machine-readable detail contract");
  const independentBodies = (await rootQuery(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) body
    from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid`, [independentSignatures])).rows;
  assert.equal(independentBodies.length, 2, "both registered E6 bodies are inspected");
  const corpus = independentBodies.map((row) => row.body).join("\n");
  assert.doesNotMatch(corpus, /evaluate_metric_v1\s*\(|_metric_eval_node_v1\s*\(|validate_metric_ast_v1\s*\(|_validate_metric_node_v1\s*\(|_metric_selector_account_ids\s*\(|_metric_input_dataset_v1\s*\(|_metric_context_sha256_v1\s*\(|_metric_resolved_inputs_sha256_v1\s*\(|trial_balance_as_of\s*\(|\bclara\.(?:journal_entries|journal_lines|open_items|open_item_allocations|period_snapshots)\b/i);
  const recheck = independentBodies.find((row) => row.signature.includes("_metric_recheck_node_v1")); const normalized = recheck.body.replace(/\s+/g, ""); for (const source of ["metric_input_snapshot_contributions", "metric_input_snapshot_open_items", "metric_input_snapshot_allocations", "metric_input_snapshot_samples"]) assert.match(recheck.body, new RegExp(source, "i"), `E6 numeric recursion reads immutable ${source}`);
  for (const source of ["metric_definition_versions", "metric_cell_assessments"]) assert.match(corpus, new RegExp(source, "i"), `E6 closure reads ${source}`);
  assert.equal((recheck.body.match(/\bclara\.coa_accounts\b/gi) ?? []).length, 2, "E6 reads current CoA exactly twice, both times only for selector identity: once to prove every explicit element resolves, once for drift"); assert.ok(normalized.includes("allowedtext[]:=array['account_ids','account_codes','account_types','account_classes','code_from','code_to']"), "E6 closes the selector grammar to exactly six keys"); assert.match(normalized, /jsonb_object_keys\(av\.selector\).*notq=any\(allowed\).*account_set_drift/i);
  const exactness = (firm, sel) => `selectcoalesce(jsonb_agg(jsonb_build_object('field',q.f,'value',q.v,'matched_active_accounts',q.n)orderbyq.f,q.v),'[]'::jsonb)intounresolvedfrom(selecte.f,e.v,(selectcount(*)fromclara.coa_accountseawhereea.client_id=p_clientandea.firm_id=${firm}andea.is_activeandcasee.fwhen'account_ids'thenea.account_id::textelseea.account_codeend=e.v)::intnfrom(select'account_ids'f,g.vfromjsonb_array_elements_text(coalesce(${sel}->'account_ids','[]'::jsonb))g(v)unionallselect'account_codes',g.vfromjsonb_array_elements_text(coalesce(${sel}->'account_codes','[]'::jsonb))g(v))e(f,v))qwhereq.n<>1;`;
  const primarySelector = (await rootQuery("select pg_get_functiondef('clara._metric_selector_account_ids(uuid,jsonb)'::regprocedure) body")).rows[0].body.replace(/\s+/g, ""); for (const [tag, body, firm, sel] of [["primary", primarySelector, "v_firm", "p_selector"], ["independent E6", normalized, "rp.firm_id", "av.selector"]]) assert.ok(body.includes(exactness(firm, sel)), `${tag} selector carries the byte-identical explicit-element exactness predicate`);
  for (const predicate of ["ca.firm_id=rp.firm_id", "ca.client_id=p_client", "not(av.selector?'account_ids')orca.account_idin(selectjsonb_array_elements_text(av.selector->'account_ids')::uuid)", "not(av.selector?'account_codes')orca.account_codein(selectjsonb_array_elements_text(av.selector->'account_codes'))", "not(av.selector?'account_types')orca.account_typein(selectjsonb_array_elements_text(av.selector->'account_types'))", "not(av.selector?'account_classes')orca.account_classin(selectjsonb_array_elements_text(av.selector->'account_classes'))", "not(av.selector?'code_from')orca.account_code>=av.selector->>'code_from'", "not(av.selector?'code_to')orca.account_code<=av.selector->>'code_to'"])
    assert.ok(normalized.toLowerCase().includes(predicate.toLowerCase()), `E6 current-CoA selector pins ${predicate}`); assert.match(normalized, /array_agg\(m\.account_idorderbym\.ordinal\).*intofrozen_ids,actual_count,bad_count.*array_agg\(ca\.account_idorderbyca\.account_id\).*intolive_ids.*live_idsisdistinctfromfrozen_ids.*actual_count<>av\.frozen_member_count.*frozen_members_sha256/i, "E6 compares canonical live identity to actual immutable membership count, order, and hash"); assert.match(normalized, /metric_input_snapshot_(samples|contributions).*joinclara\.account_set_version_members/i, "E6 numeric measure rows join immutable frozen membership");
  const registered = (await rootQuery("select evaluator_name,version,deployed,encode(closure_sha256,'hex') hash from clara.evaluator_versions order by evaluator_name,version")).rows;
  // The registered roster is the SAME closed world as `expected` above — named, not counted, so
  // a substitution cannot pass. F-A1's two closures joined it at 0091/0092; F-A2's
  // evaluate_witness_fact_state v2 joined at opener ①, which is why the identity compared here
  // is name AND VERSION: a family can carry more than one row and a name-only comparison would
  // have read the two witness versions as a duplicate rather than as the append they are.
  assert.deepEqual(registered.map((row) => `${row.evaluator_name}@v${row.version}`), [...expected.keys()].sort());
  assert.ok(registered.every((row) => row.deployed === false && /^[0-9a-f]{64}$/.test(row.hash)));
  assert.equal(new Set(registered.map((row) => row.hash)).size, registered.length,
    "every registered closure hashes differently — a shared aggregate would mean two rows freeze one body set");
});
await t.test("producer-helper changes are inside the producer freeze closure", async () => {
  const helper = "clara._metric_input_dataset_v1(uuid,uuid,uuid[])";
  assert.equal((await rootQuery("select has_table_privilege($1,'clara.evaluator_versions','UPDATE') ok", [ROLES.fnOwner])).rows[0].ok, true, "the migration ceremony owner can perform the one-way deployment transition");
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive]) assert.equal((await rootQuery("select has_table_privilege($1,'clara.evaluator_versions','UPDATE') ok", [role])).rows[0].ok, false, `${role} cannot perform the ceremony deployment transition`);
  const deployWall = (await rootQuery("select pg_get_functiondef(t.tgfoid) body from pg_trigger t where t.tgname='t_evaluatorversions_deploy_once' and t.tgrelid='clara.evaluator_versions'::regclass")).rows[0].body;
  assert.match(deployWall, /current_user\s*<>\s*session_user/i);
  assert.doesNotMatch(deployWall, /evaluator_deploy_permit|current_setting\s*\(|set_config\s*\(/i);
  const direct = await caught(() => withActor({ transaction: true }, async (db) => { const before = (await db.query("select current_user u,session_user s")).rows[0]; assert.equal(before.u, before.s); await db.query("update clara.evaluator_versions set deployed=true where evaluator_name='evaluate_metric' and version=1"); assert.equal((await db.query("select deployed from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=1")).rows[0].deployed, true); throw new Error("rollback direct deployment proof"); }));
  assert.equal(direct?.message, "rollback direct deployment proof");
  assert.equal((await rootQuery("select deployed from clara.evaluator_versions where evaluator_name='evaluate_metric' and version=1")).rows[0].deployed, false);
  for (const spoof of [async (db) => db.query(`set role ${ROLES.fnOwner}`), async (db) => { await db.query("select set_config('clara.evaluator_deploy_permit','1',true)"); await db.query(`set role ${ROLES.fnOwner}`); }]) {
    const error = await caught(() => withActor({ transaction: true }, async (db) => { await spoof(db); await db.query("update clara.evaluator_versions set deployed=true where evaluator_name='evaluate_metric' and version=1"); }));
    assert.equal(error?.code, "CLR08", `${error?.code} ${error?.message}`); assert.match(error.message, /migration ceremony principal/i);
  }
  const producer = (await rootQuery(
    "select id from clara.metric_input_producer_versions where producer_name='metric_input_snapshot' and version=1")).rows[0];
  assert.ok(producer, "the input producer closure is registered");
  const producerRoster = ["clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)", "clara._metric_input_dataset_v1(uuid,uuid,uuid[])", "clara._human_ctx(integer)", "clara.role_rank(text)", "clara.jwt_sub()", "clara.jwt_firm()", "clara.actor_role_rank()", "clara._reserve_op(uuid,text,text,bytea)", "clara._hash(jsonb)", "clara._finish_op(uuid,text,text,jsonb)", "clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)", "clara.verify_metric_input_snapshot(uuid)", "clara._tf_metric_input_snapshot_reconstruct()", "clara._tf_metric_document_binding()", "clara._active_document_filing(uuid,text,uuid,boolean)"];
  assert.deepEqual((await rootQuery("select member_signature from clara.metric_input_producer_version_members where producer_version_id=$1 order by ordinal", [producer.id])).rows.map((row) => row.member_signature), producerRoster);
  const member = (await rootQuery(`select member_signature,body_sha256
    from clara.metric_input_producer_version_members where producer_version_id=$1 and member_signature=$2`,
  [producer.id, helper])).rows[0];
  assert.ok(member, `${helper} is positively registered, not unfrozen`);
  const liveHash = (await rootQuery(
    "select sha256(convert_to(pg_get_functiondef($1::regprocedure)::text,'UTF8')) hash", [helper])).rows[0].hash;
  assert.deepEqual(member.body_sha256, liveHash, "the registered producer-helper hash equals its live body");
  assert.equal((await rootQuery("select clara.verify_metric_input_producer_freeze() r")).rows[0].r.ok, true);
});
await t.test("freeze verifier positively reads registered live bodies while deployment count is zero", async () => {
  const freeze = await exactEntrypoint("verify_evaluator_freeze");
  assert.match(freeze.definition, /evaluator_versions/i);
  assert.match(freeze.definition, /pg_get_functiondef/i);
  assert.match(freeze.definition, /deployed/i);
  const result = (await rootQuery("select clara.verify_evaluator_freeze() r")).rows[0].r;
  assert.equal(result.ok ?? result.verified ?? result.valid, true, JSON.stringify(result));
  assert.equal(result.verified_deployed, 0, JSON.stringify(result));
  // SIX registered closures at this frontier: delta's evaluate_metric +
  // assess_metric_cell_independent, F-A1's evaluate_witness_fact_state (v1) +
  // evaluate_witness_identity (0091/0092), F-A2's evaluate_witness_fact_state **v2** — the
  // three-locks nil-tax arm, a NEW closure beside the frozen v1 rather than a recut of it — and
  // F-A8 PR-1's evaluate_policy_source_value (v3/IL-D20), so the count moves by one again and
  // every frozen predecessor keeps its own row. ZERO deployed is the property this cell is
  // really about — the verifier reads every registered closure's live bodies BEFORE any
  // ceremony has flipped one, and that half is unchanged.
  assert.equal(result.verified_registered, 6, JSON.stringify(result));
});
}
