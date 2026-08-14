// Wave E lane EPSILON -- phase 5: RLS isolation and the grant matrix. NOT a test file.
//
// Everything here is a POSITIVE read of live privilege and RLS state. "The agent gains nothing"
// is asserted as a NAMED LIST, never as an absence, because absence from the wrong instrument is
// how the opposite failure hides (matrix A34's whole point).

import {
  assert, randomUUID, rootQuery, roleQuery, withActor, ROLES, PG, caught, reasonOf, opk,
  freshActiveClient, setupCloseCoa,
  publishHouseStyle, publishTemplate, layoutAst,
  EPSILON_RELATIONS, EPSILON_ENTRYPOINTS,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld } from "./epsilon-world.mjs";

// SS6(c)'s catalog list, which 0059 (lane delta's behavior file) already grants in full. Epsilon's
// reconciliation found the remainder EMPTY, so epsilon grants clara_agent_ro nothing -- and this
// is the list the census asserts positively.
const DELTA_CATALOG_NINE = [
  "account_set_versions", "account_sets", "edge_policy_sets", "metric_constants",
  "metric_definition_versions", "metric_definitions", "metric_edge_policies",
  "presentation_map_versions", "presentation_maps",
];

const REPORTING_FAMILY_SQL = `
  table_name like 'metric\\_%' or table_name like 'report\\_%' or table_name like 'chart\\_%'
  or table_name like 'statutory\\_%' or table_name like 'claim\\_%'
  or table_name like 'house\\_style%' or table_name like 'account\\_set%'
  or table_name like 'presentation\\_map%' or table_name = 'edge_policy_sets'
  or table_name = 'protected_placeholders'`;

export async function registerGrantsPhase(t, world) {
  const owner = world.users.alice;
  const dave = world.users.dave;

  await t.test("every epsilon table carries forced RLS, the owner/human policy pair and no write grant", async () => {
    const rows = (await rootQuery(
      `select c.relname,
              c.relrowsecurity and c.relforcerowsecurity as forced,
              exists(select 1 from pg_policy p where p.polrelid=c.oid
                       and p.polroles=array['clara_fn_owner'::regrole]::oid[]) as owner_policy,
              exists(select 1 from pg_policy p where p.polrelid=c.oid
                       and p.polroles=array['clara_authenticated'::regrole]::oid[]) as human_policy,
              -- tgenabled='O' is load-bearing, not decoration: a DISABLED trigger is a catalog
              -- row that enforces nothing, and counting catalog rows would call it hardened.
              exists(select 1 from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal
                       and t.tgenabled='O' and t.tgname like '%\\_no\\_truncate') as no_truncate,
              exists(select 1 from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal
                       and t.tgenabled='O'
                       and (t.tgname like '%\\_append\\_only' or t.tgname like '%\\_publication\\_freeze'
                            or t.tgname like '%\\_lifecycle')) as immutable,
              (select count(*)::int from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal
                and t.tgenabled<>'O') as disabled_triggers
         from pg_class c join pg_namespace s on s.oid=c.relnamespace
        where s.nspname='clara' and c.relkind='r' and c.relname=any($1) order by c.relname`,
      [EPSILON_RELATIONS])).rows;
    assert.equal(rows.length, EPSILON_RELATIONS.length, "every epsilon relation is present");
    for (const row of rows) {
      assert.deepEqual(
        [row.forced, row.owner_policy, row.human_policy, row.no_truncate, row.immutable,
          row.disabled_triggers],
        [true, true, true, true, true, 0], `clara.${row.relname} is fully hardened`);
    }
    const writeGrants = (await rootQuery(
      `select table_name, grantee, privilege_type from information_schema.table_privileges
        where table_schema='clara' and table_name=any($1)
          and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
          and grantee like 'clara\\_%' and grantee <> 'clara_fn_owner' order by 1,2,3`,
      [EPSILON_RELATIONS])).rows;
    assert.deepEqual(writeGrants, [],
      "no app role holds a write privilege on any epsilon table -- writes ride the audited verbs");
  });

  await t.test("RLS isolation: a second firm reads ZERO rows of the first firm's reporting estate", async () => {
    const mine = await buildEpsilonWorld(world, { tag: "rls-a", reportClass: "management" });
    // Firm B gets its own house style + template so the comparison is like-for-like: both firms
    // hold rows, and each must see only its own.
    const daveClient = await freshActiveClient(dave, `eps-rls-b-${randomUUID().slice(0, 6)}`);
    await setupCloseCoa(dave, daveClient);
    const daveStyle = await publishHouseStyle(dave, { styleKey: `b-style-${randomUUID().slice(0, 6)}` });
    await publishTemplate(dave, {
      templateKey: `b-tpl-${randomUUID().slice(0, 6)}`, reportClass: "management",
      claimCapability: "no_claim", houseStyleVersionId: daveStyle.house_style_version_id,
      layout: layoutAst(["summary"]),
    });

    const firmScoped = ["house_styles", "house_style_versions", "report_templates",
      "report_template_versions", "report_specs", "report_spec_versions", "report_runs",
      "report_claim_assessments", "report_datasets", "report_dataset_points", "report_artifacts",
      "chart_templates", "chart_template_versions"];
    for (const relation of firmScoped) {
      const seen = await withActor({ role: ROLES.authenticated, jwtSub: dave }, (db) =>
        db.query(`select count(*)::int n from clara.${relation} where firm_id=$1`, [world.firms.A]));
      assert.equal(seen.rows[0].n, 0,
        `firm B reads zero of firm A's clara.${relation} rows`);
      // The positive half, per table, measured against the truth. `n >= 0` was the shape this
      // used to have, and a deny-all human policy on all thirteen tables would have satisfied it
      // -- the isolation would have read perfect while the product was unusable. Comparing the
      // human's count to root's count for the same firm is the assertion that can actually fail.
      const own = await withActor({ role: ROLES.authenticated, jwtSub: owner }, (db) =>
        db.query(`select count(*)::int n from clara.${relation} where firm_id=$1`, [world.firms.A]));
      const truth = (await rootQuery(
        `select count(*)::int n from clara.${relation} where firm_id=$1`, [world.firms.A])).rows[0].n;
      assert.ok(truth > 0, `firm A actually holds clara.${relation} rows, so the comparison means something`);
      assert.equal(own.rows[0].n, truth,
        `firm A's own human sees every one of its clara.${relation} rows`);
    }
    // The 13 tables above are every epsilon table that CARRIES a firm. The remaining 8 are the
    // product-curated ones whose firm_id is CHECK-constrained to null; they are global by
    // design, and the next cell reads them from a second firm to prove that is what they are --
    // rather than leaving 8 of 21 tables unmeasured.
    // And the positive half: firm A DOES see its own run, so the zero above is scoping, not an
    // empty table.
    const ownRun = await withActor({ role: ROLES.authenticated, jwtSub: owner }, (db) =>
      db.query("select count(*)::int n from clara.report_runs where id=$1", [mine.runId]));
    assert.equal(ownRun.rows[0].n, 1);
    const foreignRun = await withActor({ role: ROLES.authenticated, jwtSub: dave }, (db) =>
      db.query("select count(*)::int n from clara.report_runs where id=$1", [mine.runId]));
    assert.equal(foreignRun.rows[0].n, 0, "a foreign run is invisible, not merely unwritable");
  });

  await t.test("the curator tables are readable by every human and writable by nobody", async () => {
    for (const relation of ["statutory_profiles", "statutory_profile_versions", "statutory_sections",
      "statutory_slots", "protected_placeholders", "claim_phrase_lexicon", "claim_policy_versions"]) {
      const seen = await withActor({ role: ROLES.authenticated, jwtSub: dave }, (db) =>
        db.query(`select count(*)::int n from clara.${relation}`));
      assert.ok(seen.rows[0].n > 0, `product-curated clara.${relation} is readable across firms`);
      const write = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: dave }, (db) =>
        db.query(`delete from clara.${relation}`)));
      assert.equal(write?.code, PG.insufficientPrivilege, `clara.${relation} is not writable by a human role`);
    }
    // A curated table with a granted writer would be a FAIL of E-R5's curation boundary. This is
    // matrix A29's method: privilege state through aclexplode, never the migration's own text.
    const writers = (await rootQuery(
      `select p.proname from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl,'{}')) a join pg_roles r on r.oid=a.grantee
        where p.pronamespace='clara'::regnamespace and a.privilege_type='EXECUTE'
          and r.rolname=any(array['clara_authenticated','clara_agent_ro','clara_runtime',
            'clara_runtime_login','clara_wake_interactive','clara_wake_proactive'])
          and lower(coalesce(p.prosrc,'')) ~ '(insert\\s+into|update|delete\\s+from)\\s+clara\\.(statutory_profiles|statutory_profile_versions|statutory_sections|statutory_slots|statutory_wording|protected_placeholders|claim_phrase_lexicon|claim_policy_versions)\\M'
        order by 1`)).rows;
    assert.deepEqual(writers, [], "no granted function writes a curated reference table");
  });

  await t.test("the agent gains NOTHING: zero EXECUTE, and a catalog SELECT list asserted by NAME", async () => {
    const agentExec = (await rootQuery(
      `select p.proname from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl,'{}')) a join pg_roles r on r.oid=a.grantee
        where p.pronamespace='clara'::regnamespace and a.privilege_type='EXECUTE'
          and r.rolname='clara_agent_ro' and p.proname=any($1) order by 1`,
      [EPSILON_ENTRYPOINTS.map(([name]) => name)])).rows;
    assert.deepEqual(agentExec, [], "clara_agent_ro receives ZERO EXECUTE on every epsilon verb");

    const agentReporting = (await rootQuery(
      `select table_name from information_schema.table_privileges
        where table_schema='clara' and grantee='clara_agent_ro' and privilege_type='SELECT'
          and (${REPORTING_FAMILY_SQL}) order by table_name`)).rows.map((r) => r.table_name);
    assert.deepEqual([...agentReporting].sort(), [...DELTA_CATALOG_NINE].sort(),
      "the agent's reporting SELECT set is EXACTLY lane delta's nine catalog tables -- epsilon's "
      + "reconciliation found the remainder empty and granted nothing");

    // The opposite failure, named: a SELECT reaching clara.metric_cells would hand the model a
    // client's figures. Asserted per table, positively, not as one absence claim.
    for (const forbidden of ["metric_cells", "metric_cell_periods", "metric_input_snapshots",
      "report_runs", "report_datasets", "report_dataset_points", "report_artifacts",
      "report_claim_assessments", "report_spec_versions", "report_template_versions"]) {
      const granted = (await rootQuery(
        `select count(*)::int n from information_schema.table_privileges
          where table_schema='clara' and grantee='clara_agent_ro' and table_name=$1`, [forbidden])).rows[0].n;
      assert.equal(granted, 0, `clara_agent_ro holds no privilege at all on clara.${forbidden}`);
      const read = await caught(() => roleQuery(ROLES.agentRo, `select 1 from clara.${forbidden} limit 1`));
      assert.equal(read?.code, PG.insufficientPrivilege,
        `a live read of clara.${forbidden} under the agent role is refused: ${read?.message}`);
    }
    // The catalog IS REACHABLE, which is the half a bare "the agent gains nothing" got wrong: it
    // was true of EXECUTE and false of SELECT, and left list_metric_catalog with no path to its
    // own data. This asserts reachability only -- RLS still scopes what the read RETURNS, and
    // that scoping half belongs to lane delta's own catalog cell (matrix A34 iii).
    for (const catalog of DELTA_CATALOG_NINE) {
      const read = await caught(() => roleQuery(ROLES.agentRo, `select count(*) from clara.${catalog}`));
      assert.equal(read, null, `clara_agent_ro can REACH clara.${catalog}: ${read?.message}`);
    }
  });

  await t.test("the same matrix through the instrument the planner uses: has_*_privilege", async () => {
    // A second instrument on purpose. information_schema and aclexplode read the catalog;
    // has_table_privilege / has_function_privilege ask the same question the executor asks, and a
    // disagreement between them would be exactly the kind of finding a single reading hides.
    for (const relation of EPSILON_RELATIONS) {
      const row = (await rootQuery(
        `select has_table_privilege('clara_authenticated', $1, 'SELECT') human_select,
                has_table_privilege('clara_authenticated', $1, 'INSERT') human_insert,
                has_table_privilege('clara_agent_ro', $1, 'SELECT') agent_select,
                has_table_privilege('clara_wake_interactive', $1, 'SELECT') wake_select`,
        [`clara.${relation}`])).rows[0];
      assert.deepEqual([row.human_select, row.human_insert, row.agent_select, row.wake_select],
        [true, false, false, false], `clara.${relation}: humans read, nobody writes, the agent is out`);
    }
    for (const [name, signature] of EPSILON_ENTRYPOINTS) {
      const row = (await rootQuery(
        `select has_function_privilege('clara_authenticated', $1, 'EXECUTE') human,
                has_function_privilege('clara_agent_ro', $1, 'EXECUTE') agent,
                has_function_privilege('clara_wake_interactive', $1, 'EXECUTE') wake_i,
                has_function_privilege('clara_wake_proactive', $1, 'EXECUTE') wake_p,
                has_function_privilege('clara_runtime', $1, 'EXECUTE') runtime,
                has_function_privilege('public', $1, 'EXECUTE') pub`, [signature])).rows[0];
      assert.deepEqual([row.human, row.agent, row.wake_i, row.wake_p, row.runtime, row.pub],
        [true, false, false, false, false, false],
        `clara.${name} is callable by clara_authenticated and by nobody else`);
    }
    for (const internal of ["clara._validate_layout_ast_v1(jsonb,text)", "clara._validate_chart_spec_ast_v1(jsonb)",
      "clara._validate_chart_spec_semantics_v1(uuid,jsonb)", "clara._report_manifest_required_keys(text)",
      "clara._report_dataset_payload_v1(uuid)", "clara.verify_report_dataset(uuid)",
      "clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)",
      "clara._draft_report_spec_core(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)"]) {
      for (const role of ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive",
        "clara_wake_proactive", "clara_runtime", "public"]) {
        assert.equal((await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') p", [role, internal])).rows[0].p,
          false, `${internal} is unreachable from ${role}`);
      }
    }
  });

  await t.test("every epsilon verb is granted to clara_authenticated ONLY", async () => {
    const rows = (await rootQuery(
      `select p.proname, r.rolname from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl,'{}')) a join pg_roles r on r.oid=a.grantee
        where p.pronamespace='clara'::regnamespace and a.privilege_type='EXECUTE'
          and p.proname=any($1) and r.rolname like 'clara\\_%' and r.rolname<>'clara_fn_owner'
        order by 1,2`, [EPSILON_ENTRYPOINTS.map(([name]) => name)])).rows;
    assert.deepEqual([...new Set(rows.map((r) => r.rolname))], ["clara_authenticated"],
      "no wake role, no runtime role, no agent role holds EXECUTE on any epsilon verb");
    assert.deepEqual([...new Set(rows.map((r) => r.proname))].sort(),
      EPSILON_ENTRYPOINTS.map(([name]) => name).sort(),
      "and every one of the ten IS granted -- a verb nobody can call is a verb that does not exist");

    // Definer + owner + pinned search_path on every verb, read from pg_proc.
    const posture = (await rootQuery(
      `select p.proname, p.prosecdef, p.proowner::regrole::text owner, p.proconfig
         from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=any($1) order by 1`,
      [EPSILON_ENTRYPOINTS.map(([name]) => name)])).rows;
    for (const row of posture) {
      assert.deepEqual([row.prosecdef, row.owner, row.proconfig],
        [true, ROLES.fnOwner, ["search_path=clara, pg_temp"]],
        `clara.${row.proname} is a clara_fn_owner definer with a pinned search_path`);
    }
  });

  await t.test("gate 1 lives in the ungranted seal CORE, and the human wrapper carries none of it", async () => {
    // Ruled with lane zeta: its render worker completes jobs under clara_runtime with NO JWT, so
    // the gate had to be reachable without one. The core takes firm/actor as arguments and is
    // granted to nobody; the wrapper resolves the human context and delegates. Read from prosrc,
    // because "the gate is in the core" is a claim about the bodies, not about the file.
    const [wrapper, core] = await Promise.all([
      rootQuery(`select prosrc from pg_proc
        where oid='clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure`),
      rootQuery(`select prosrc from pg_proc
        where oid='clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure`),
    ]);
    const tokens = ["claim_assessment_absent", "claim_assessment_failed", "draft_definition_in_dataset",
      "nonstat_definition_in_dataset", "manifest_key_missing"];
    for (const token of tokens) {
      assert.ok(core.rows[0].prosrc.includes(token), `the core raises ${token}`);
      assert.ok(!wrapper.rows[0].prosrc.includes(token),
        `the wrapper does NOT raise ${token} -- one gate, not two copies to keep in step`);
    }
    assert.ok(wrapper.rows[0].prosrc.includes("_seal_report_artifact_core"),
      "the wrapper delegates rather than reimplementing");
    assert.ok(wrapper.rows[0].prosrc.includes("_human_ctx"), "and it is the door that resolves the human");
    assert.ok(!core.rows[0].prosrc.includes("_human_ctx"),
      "the core takes firm/actor as arguments -- that is what lets a JWT-less runtime caller reach it");
  });

  await t.test("drafting judgement lives in the ungranted core, reachable without a JWT", async () => {
    // Ruled with lane eta: the WAKE channel never sets request.jwt.claims, so a JWT-resolving body
    // would CLR04 on every wake call. The core takes actor/firm/obo/wake_kind as arguments; each
    // lane brings its own audited door to the SAME drafting rule, rather than eta re-deriving it.
    const [wrapper, core] = await Promise.all([
      rootQuery(`select prosrc from pg_proc
        where oid='clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)'::regprocedure`),
      rootQuery(`select prosrc from pg_proc
        where oid='clara._draft_report_spec_core(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)'::regprocedure`),
    ]);
    // The SPLIT is a structural claim about which body holds what, so it is read from the bodies.
    for (const check of ["client_not_in_firm", "report_template_version_not_in_firm",
      "_validate_layout_ast_v1", "_reserve_op"]) {
      assert.ok(!wrapper.rows[0].prosrc.includes(check),
        `the wrapper does NOT re-perform ${check} -- one drafting rule, not two`);
    }
    assert.ok(wrapper.rows[0].prosrc.includes("_human_ctx"), "the wrapper is the human door");
    assert.ok(!core.rows[0].prosrc.includes("_human_ctx"),
      "the core never touches a JWT -- that is what makes the wake lane able to call it");

    // But whether the core still ENFORCES those four is a claim about behaviour, and a body can
    // keep every one of those tokens in a comment or in dead code. So each is driven through the
    // core itself, JWT-less, exactly as lane eta's wake channel will reach it.
    const base = await buildEpsilonWorld(world, { tag: "core-behaviour", reportClass: "management", seal: false });
    const foreignClient = await freshActiveClient(dave, `eps-core-foreign-${randomUUID().slice(0, 6)}`);
    const callCore = (args) => rootQuery(
      `select clara._draft_report_spec_core($1,$2,null,null,$3,$4,$5,$6,'en','{}'::jsonb,'{}'::jsonb,
                                            $7::jsonb,'2026-01-01',$8) r`,
      [owner, world.firms.A, args.client ?? base.client, args.specKey ?? `core-${randomUUID().slice(0, 6)}`,
        "Core behaviour", args.templateVersionId ?? base.template.report_template_version_id,
        JSON.stringify(args.layout ?? base.layout), args.opKey ?? opk("eps-core")]);

    const crossFirm = await caught(() => callCore({ client: foreignClient }));
    assert.equal(crossFirm?.code, "CLR11", `client binding: ${crossFirm?.message}`);
    assert.equal(reasonOf(crossFirm), "client_not_in_firm",
      "the core binds the client to the firm it was HANDED, not to a JWT it never reads");

    const foreignTemplate = await caught(() => callCore({ templateVersionId: randomUUID() }));
    assert.equal(foreignTemplate?.code, "CLR11", `template lookup: ${foreignTemplate?.message}`);
    assert.equal(reasonOf(foreignTemplate), "report_template_version_not_in_firm",
      "the core looks the template version up rather than trusting the id it was given");

    const smuggled = await caught(() => callCore({
      layout: { ast: "clara.layout/v1", sections: [{ section_key: "summary", blocks: [
        { node: "text", value: 125_000 }] }] } }));
    assert.equal(smuggled?.code, "CLR10", `layout validation: ${smuggled?.message}`);
    assert.equal(reasonOf(smuggled), "numeric_literal_forbidden",
      "the core actually RUNS the layout validator -- the wake lane gets the same E-R8 floor");

    // Reservation, proven the only way it can be: the same key twice replays instead of drafting
    // twice, and the same key with different arguments refuses.
    const opKey = opk("eps-core-replay");
    const specKey = `core-replay-${randomUUID().slice(0, 6)}`;
    const first = (await callCore({ opKey, specKey })).rows[0].r;
    assert.ok(first.report_spec_version_id, "the first call drafts");
    const replay = (await callCore({ opKey, specKey })).rows[0].r;
    assert.equal(replay.report_spec_version_id, first.report_spec_version_id,
      "the same op key replays its receipt rather than minting a second version");
    const reused = await caught(() => callCore({ opKey, specKey: `different-${randomUUID().slice(0, 6)}` }));
    assert.equal(reused?.code, "CLR10", reused?.message);
    assert.match(reused?.message ?? "", /op_key reused with different args/,
      "and the same key with different arguments refuses rather than aliasing");
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.report_spec_versions where report_spec_id=$1",
      [first.report_spec_id])).rows[0].n, 1,
      "one reservation, one version -- the replay drafted nothing");

    // The audit row is read from the LOG, not from the body that writes it, and the wake columns
    // are null here because this call came through the human-shaped path -- which is what makes a
    // wake draft distinguishable from a human one at all.
    const audited = (await rootQuery(
      `select count(*)::int n, bool_and(on_behalf_of is null and via_wake_kind is null) human_lane
         from clara.audit_log where fn='draft_report_spec' and args->>'version_id'=$1`,
      [first.report_spec_version_id])).rows[0];
    assert.equal(audited.n, 1, "the core audits its own act exactly once");
    assert.equal(audited.human_lane, true, "and records the lane it was called through");
  });

  await t.test("the exact public signatures are the ones the design named", async () => {
    for (const [name, signature] of EPSILON_ENTRYPOINTS) {
      const rows = (await rootQuery(
        `select p.oid::regprocedure::text sig from pg_proc p
          where p.pronamespace='clara'::regnamespace and p.proname=$1 order by 1`, [name])).rows;
      assert.deepEqual(rows.map((r) => r.sig.startsWith("clara.") ? r.sig : `clara.${r.sig}`),
        [signature], `clara.${name} has exactly one signature, and it is the named one`);
    }
  });
}
