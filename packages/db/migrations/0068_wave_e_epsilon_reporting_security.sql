-- 0068_wave_e_epsilon_reporting_security.sql -- Wave E lane epsilon, file 5 of 7.
--
-- Applies after 0067_wave_e_epsilon_reporting_schema_validators.sql and before
-- 0069_wave_e_epsilon_reporting_security_seal.sql. Number claims at MERGE; the timeout
-- is PRECAUTIONARY.
--
-- THE PUBLISHING VERBS -- layers 3, 4/6 and 5, plus the chart registry:
--   W1  publish_house_style_version     -- OWNER floor (E-R14: owner-sovereign)
--   W2  publish_report_template_version -- admin+ statutory / bookkeeper+ management
--   W3  publish_chart_template_version  -- bookkeeper+
--   W4  draft_report_spec               -- bookkeeper+ (key 1, prepare)
--
-- GRANT CLASS (a) -- human writers reach these by EXECUTE to clara_authenticated ONLY, the
-- 0004:766-780 shape. No wake role and no runtime role receives EXECUTE on anything here, and
-- clara_agent_ro receives nothing at all (SS6(c)'s negative; the seal file's tail asserts the
-- whole epsilon function set positively).
--
-- WHY VALIDATION LIVES AT PUBLISH TIME. E-R8 floor 1 and the protected-placeholder rule are
-- enforced here, before anything can render: a template or spec that could smuggle a typed
-- figure never reaches a run, so the render lane never has to decide what to do with one.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_security_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_security_pre values ('deploy_principal', session_user);

do $pre$
declare n text;
begin
  foreach n in array array['clara._validate_layout_ast_v1(jsonb)',
    'clara._validate_chart_spec_semantics_v1(uuid,jsonb)'] loop
    if to_regprocedure(n) is null then
      raise exception 'epsilon security requires % (file 4 not applied)', n using errcode = 'CLR10';
    end if;
  end loop;
  if to_regprocedure('clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,text)') is not null then
    raise exception 'epsilon security partial birth: clara.draft_report_spec already exists' using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- W1 -- PUBLISH A HOUSE STYLE VERSION. OWNER floor (E-R14: owner-sovereign; the LLM drafts, a
-- human publishes). Every asset in the manifest must be content-addressed, because SS7's image
-- residual rests on exactly that: an image whose bytes are pinned by hash and published by the
-- owner is a recorded human act by the one role that could also just approve a false claim
-- directly -- not a model-reachable channel, and not a user-supplied one.
-- =====================================================================================
create function clara.publish_house_style_version(
    p_style_key text, p_title text, p_style_spec jsonb, p_asset_manifest jsonb,
    p_effective_from date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_style uuid; v_id uuid; v_rev int; prior jsonb; v_hash bytea; kk text; vv jsonb;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if nullif(btrim(coalesce(p_style_key, '')), '') is null or nullif(btrim(coalesce(p_title, '')), '') is null
     or p_style_spec is null or jsonb_typeof(p_style_spec) <> 'object'
     or p_asset_manifest is null or jsonb_typeof(p_asset_manifest) <> 'object'
     or p_effective_from is null then
    raise exception 'house style publication is malformed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply a style key, title, object spec, object asset manifest and effective_from"}';
  end if;
  for kk, vv in select key, value from jsonb_each(p_asset_manifest) loop
    if jsonb_typeof(vv) <> 'string' or (vv#>>'{}') !~ '^[0-9a-f]{64}$' then
      raise exception 'house style asset % is not content-addressed', kk using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'asset_not_content_addressed', 'asset', kk,
          'fix', 'pin every font, logo and image by its sha256 hex digest')::text;
    end if;
  end loop;
  prior := clara._reserve_op(c.firm, 'publish_house_style_version', p_op_key,
    clara._hash(jsonb_build_object('key', p_style_key, 'title', p_title, 'spec', p_style_spec,
      'assets', p_asset_manifest, 'from', p_effective_from)));
  if prior is not null then return prior; end if;

  select id into v_style from clara.house_styles where firm_id = c.firm and style_key = p_style_key for update;
  if v_style is null then
    insert into clara.house_styles(firm_id, style_key, title, created_by)
      values (c.firm, p_style_key, p_title, c.actor) returning id into v_style;
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from clara.house_style_versions where house_style_id = v_style;
  if exists (select 1 from clara.house_style_versions
              where house_style_id = v_style and state = 'published' and effective_from >= p_effective_from) then
    raise exception 'house style effective window overlaps or reverses' using errcode = 'CLR10',
      detail = '{"reason":"effective_window_overlap","fix":"publish with an effective_from after the current version''s"}';
  end if;
  update clara.house_style_versions set state = 'superseded', effective_to = p_effective_from - 1
   where house_style_id = v_style and state = 'published';
  v_hash := clara._hash(jsonb_build_object('schema', 'clara.house-style/v1', 'style_spec', p_style_spec,
    'asset_manifest', p_asset_manifest));
  insert into clara.house_style_versions(firm_id, house_style_id, revision, style_spec, asset_manifest,
      content_sha256, state, effective_from, published_by)
    values (c.firm, v_style, v_rev, p_style_spec, p_asset_manifest, v_hash, 'published', p_effective_from, c.actor)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'publish_house_style_version', null,
    jsonb_build_object('house_style_id', v_style, 'version_id', v_id, 'revision', v_rev));
  return clara._finish_op(c.firm, 'publish_house_style_version', p_op_key,
    jsonb_build_object('house_style_id', v_style, 'house_style_version_id', v_id, 'revision', v_rev,
      'content_sha256', encode(v_hash, 'hex')));
end $$;
revoke all on function clara.publish_house_style_version(text, text, jsonb, jsonb, date, text) from public;

-- =====================================================================================
-- W2 -- PUBLISH A REPORT TEMPLATE VERSION. The floor SPLITS by class (SS6): admin+ for
-- statutory, bookkeeper+ for management. A statutory template must also lay out every REQUIRED
-- section of its bound profile -- refused HERE rather than assessed `stripped` on every run it
-- would ever feed, so the honest-FS law (matrix D7) bites at the earliest point that can see it.
-- =====================================================================================
create function clara.publish_report_template_version(
    p_template_key text, p_title text, p_report_class text, p_claim_capability text,
    p_statutory_profile_version_id uuid, p_house_style_version_id uuid, p_layout_ast jsonb,
    p_effective_from date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_tpl uuid; v_id uuid; v_rev int; prior jsonb; v_hash bytea;
  v_shape jsonb; v_profile_cap text; v_missing text[];
begin
  if p_report_class is null or p_report_class not in ('statutory', 'management') then
    raise exception 'report class % is not registered', p_report_class using errcode = 'CLR10',
      detail = '{"reason":"report_class_unknown","fix":"publish a statutory or a management template"}';
  end if;
  c := clara._human_ctx(clara.role_rank(case p_report_class when 'statutory' then 'admin' else 'bookkeeper' end));
  if p_claim_capability is null or p_claim_capability not in ('claims_compliance', 'no_claim')
     or p_effective_from is null or nullif(btrim(coalesce(p_template_key, '')), '') is null then
    raise exception 'report template publication is malformed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply a template key, a registered claim capability and effective_from"}';
  end if;
  if not exists (select 1 from clara.house_style_versions
                  where id = p_house_style_version_id and firm_id = c.firm and state = 'published') then
    raise exception 'house style version is not a published version of this firm' using errcode = 'CLR11',
      detail = '{"reason":"house_style_version_not_in_firm","fix":"bind a house style version this firm has published"}';
  end if;
  if p_report_class = 'statutory' then
    select sp.claim_capability into v_profile_cap from clara.statutory_profile_versions v
      join clara.statutory_profiles sp on sp.profile_key = v.profile_key
     where v.id = p_statutory_profile_version_id;
    if not found then
      raise exception 'statutory profile version is absent' using errcode = 'CLR11',
        detail = '{"reason":"statutory_profile_version_absent","fix":"bind a shipped statutory profile version"}';
    end if;
    -- A profile that cannot claim compliance cannot lend a template the capability (matrix C5:
    -- the sole-prop pack is convention-labelled, never MPERS-claimed).
    if p_claim_capability = 'claims_compliance' and v_profile_cap <> 'claims_compliance' then
      raise exception 'this authority profile does not claim compliance' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'claim_capability_exceeds_profile',
          'profile_claim_capability', v_profile_cap,
          'fix', 'publish this template with claim_capability no_claim -- the profile is convention-based')::text;
    end if;
  elsif p_statutory_profile_version_id is not null then
    raise exception 'a management template binds no statutory profile' using errcode = 'CLR10',
      detail = '{"reason":"management_template_binds_profile","fix":"omit the statutory profile version"}';
  end if;

  v_shape := clara._validate_layout_ast_v1(p_layout_ast);
  if p_report_class = 'statutory' then
    select coalesce(array_agg(s.section_key order by s.ordinal), '{}') into v_missing
      from clara.statutory_sections s
     where s.profile_version_id = p_statutory_profile_version_id and s.required
       and not (s.section_key = any (array(select value#>>'{}' from jsonb_array_elements(v_shape->'sections'))));
    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception 'statutory template omits required section(s)' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'layout_omits_required_section', 'missing_sections', v_missing,
          'fix', 'a statutory template lays out every required section of its profile')::text;
    end if;
  end if;

  prior := clara._reserve_op(c.firm, 'publish_report_template_version', p_op_key,
    clara._hash(jsonb_build_object('key', p_template_key, 'class', p_report_class, 'cap', p_claim_capability,
      'profile', p_statutory_profile_version_id, 'style', p_house_style_version_id,
      'layout', p_layout_ast, 'from', p_effective_from)));
  if prior is not null then return prior; end if;

  select id into v_tpl from clara.report_templates
   where firm_id = c.firm and template_key = p_template_key for update;
  if v_tpl is null then
    insert into clara.report_templates(firm_id, template_key, title, report_class, created_by)
      values (c.firm, p_template_key, coalesce(nullif(btrim(p_title), ''), p_template_key), p_report_class, c.actor)
      returning id into v_tpl;
  elsif (select report_class from clara.report_templates where id = v_tpl) <> p_report_class then
    raise exception 'a template''s report class is fixed at birth' using errcode = 'CLR10',
      detail = '{"reason":"report_class_immutable","fix":"register a new template key for the other class"}';
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from clara.report_template_versions where report_template_id = v_tpl;
  if exists (select 1 from clara.report_template_versions
              where report_template_id = v_tpl and state = 'published' and effective_from >= p_effective_from) then
    raise exception 'report template effective window overlaps or reverses' using errcode = 'CLR10',
      detail = '{"reason":"effective_window_overlap","fix":"publish with an effective_from after the current version''s"}';
  end if;
  update clara.report_template_versions set state = 'superseded', effective_to = p_effective_from - 1
   where report_template_id = v_tpl and state = 'published';
  v_hash := clara._hash(jsonb_build_object('schema', 'clara.report-template/v1', 'class', p_report_class,
    'claim_capability', p_claim_capability, 'profile_version', p_statutory_profile_version_id,
    'house_style_version', p_house_style_version_id, 'layout', p_layout_ast));
  insert into clara.report_template_versions(firm_id, report_template_id, report_class, revision,
      claim_capability, statutory_profile_version_id, house_style_version_id, layout_ast,
      content_sha256, state, effective_from, published_by)
    values (c.firm, v_tpl, p_report_class, v_rev, p_claim_capability, p_statutory_profile_version_id,
      p_house_style_version_id, p_layout_ast, v_hash, 'published', p_effective_from, c.actor)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'publish_report_template_version', null,
    jsonb_build_object('report_template_id', v_tpl, 'version_id', v_id, 'class', p_report_class));
  return clara._finish_op(c.firm, 'publish_report_template_version', p_op_key,
    jsonb_build_object('report_template_id', v_tpl, 'report_template_version_id', v_id, 'revision', v_rev,
      'report_class', p_report_class, 'claim_capability', p_claim_capability,
      'content_sha256', encode(v_hash, 'hex'), 'layout', v_shape));
end $$;
revoke all on function clara.publish_report_template_version(text, text, text, text, uuid, uuid, jsonb, date, text) from public;

-- W3 -- PUBLISH A CHART TEMPLATE VERSION (bookkeeper+). axis_policy is READ OUT OF the
-- validated AST rather than accepted as a second parameter, so the stored column and the spec
-- cannot disagree about which policy a sealed manifest later records.
create function clara.publish_chart_template_version(
    p_chart_key text, p_title text, p_chart_spec_ast jsonb, p_effective_from date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_chart uuid; v_id uuid; v_rev int; prior jsonb; v_hash bytea; v_shape jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if nullif(btrim(coalesce(p_chart_key, '')), '') is null or p_effective_from is null then
    raise exception 'chart template publication is malformed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply a chart key and effective_from"}';
  end if;
  v_shape := clara._validate_chart_spec_semantics_v1(c.firm, p_chart_spec_ast);
  prior := clara._reserve_op(c.firm, 'publish_chart_template_version', p_op_key,
    clara._hash(jsonb_build_object('key', p_chart_key, 'spec', p_chart_spec_ast, 'from', p_effective_from)));
  if prior is not null then return prior; end if;

  select id into v_chart from clara.chart_templates where firm_id = c.firm and chart_key = p_chart_key for update;
  if v_chart is null then
    insert into clara.chart_templates(firm_id, chart_key, title, created_by)
      values (c.firm, p_chart_key, coalesce(nullif(btrim(p_title), ''), p_chart_key), c.actor)
      returning id into v_chart;
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from clara.chart_template_versions where chart_template_id = v_chart;
  if exists (select 1 from clara.chart_template_versions
              where chart_template_id = v_chart and state = 'published' and effective_from >= p_effective_from) then
    raise exception 'chart template effective window overlaps or reverses' using errcode = 'CLR10',
      detail = '{"reason":"effective_window_overlap","fix":"publish with an effective_from after the current version''s"}';
  end if;
  update clara.chart_template_versions set state = 'superseded', effective_to = p_effective_from - 1
   where chart_template_id = v_chart and state = 'published';
  v_hash := clara._hash(jsonb_build_object('schema', 'clara.chart/v1', 'spec', p_chart_spec_ast));
  insert into clara.chart_template_versions(firm_id, chart_template_id, revision, chart_spec_ast,
      axis_policy, content_sha256, state, effective_from, published_by)
    values (c.firm, v_chart, v_rev, p_chart_spec_ast, v_shape->>'axis_policy', v_hash, 'published',
      p_effective_from, c.actor) returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'publish_chart_template_version', null,
    jsonb_build_object('chart_template_id', v_chart, 'version_id', v_id));
  return clara._finish_op(c.firm, 'publish_chart_template_version', p_op_key,
    jsonb_build_object('chart_template_id', v_chart, 'chart_template_version_id', v_id, 'revision', v_rev,
      'axis_policy', v_shape->>'axis_policy', 'content_sha256', encode(v_hash, 'hex')));
end $$;
revoke all on function clara.publish_chart_template_version(text, text, jsonb, date, text) from public;

-- W4 -- DRAFT A REPORT SPEC (bookkeeper+, key 1 prepare). The instance layer: parameters,
-- overrides and the RESOLVED layout. The SAME validator runs here as at template publish, so an
-- override cannot reintroduce a numeric literal or a literal-bound protected placeholder that
-- the template itself would have been refused for.
--
-- WRAPPER + CORE, the 0004:749-750 dual-lane shape (ruled with lane eta). The core takes its
-- caller identity as ARGUMENTS -- actor, firm, and the on-behalf-of/wake-kind pair the audit row
-- needs -- because the WAKE channel never sets request.jwt.claims: eta's wake_draft_report_spec
-- would CLR04 on every call against a JWT-resolving body. Every check below stays in the core and
-- nothing agent-specific is added to it, so there is ONE piece of drafting judgement rather than
-- eta re-deriving it. The core is granted to NOBODY; each lane brings its own audited door.
create function clara._draft_report_spec_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_spec_key text, p_title text, p_report_template_version_id uuid,
    p_locale text, p_parameters jsonb, p_overrides jsonb, p_layout_ast jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_spec uuid; v_id uuid; v_rev int; prior jsonb; v_hash bytea; v_shape jsonb;
begin
  if not exists (select 1 from clara.clients where id = p_client and firm_id = p_firm) then
    raise exception 'client not found' using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  if coalesce(p_locale, '') not in ('en', 'ms', 'zh') or nullif(btrim(coalesce(p_spec_key, '')), '') is null
     or p_parameters is null or jsonb_typeof(p_parameters) <> 'object'
     or p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then
    raise exception 'report spec draft is malformed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply a spec key, a registered locale and object parameters/overrides"}';
  end if;
  select * into t from clara.report_template_versions
   where id = p_report_template_version_id and firm_id = p_firm and state = 'published';
  if not found then
    raise exception 'report template version is not a published version of this firm' using errcode = 'CLR11',
      detail = '{"reason":"report_template_version_not_in_firm","fix":"draft against a template version this firm has published"}';
  end if;
  v_shape := clara._validate_layout_ast_v1(p_layout_ast);

  prior := clara._reserve_op(p_firm, 'draft_report_spec', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'key', p_spec_key,
      'template', p_report_template_version_id, 'locale', p_locale, 'parameters', p_parameters,
      'overrides', p_overrides, 'layout', p_layout_ast)));
  if prior is not null then return prior; end if;

  select id into v_spec from clara.report_specs where client_id = p_client and spec_key = p_spec_key for update;
  if v_spec is null then
    insert into clara.report_specs(firm_id, client_id, spec_key, title, created_by)
      values (p_firm, p_client, p_spec_key, coalesce(nullif(btrim(p_title), ''), p_spec_key), p_actor)
      returning id into v_spec;
  end if;
  select coalesce(max(revision), 0) + 1 into v_rev from clara.report_spec_versions where report_spec_id = v_spec;
  update clara.report_spec_versions set state = 'superseded', effective_to = current_date
   where report_spec_id = v_spec and state = 'published';
  v_hash := clara._hash(jsonb_build_object('schema', 'clara.report-spec/v1',
    'template_version', p_report_template_version_id, 'locale', p_locale, 'parameters', p_parameters,
    'overrides', p_overrides, 'layout', p_layout_ast));
  insert into clara.report_spec_versions(firm_id, client_id, report_spec_id, revision,
      report_template_version_id, report_class, locale, parameters, overrides, layout_ast,
      content_sha256, state, effective_from, drafted_by)
    values (p_firm, p_client, v_spec, v_rev, p_report_template_version_id, t.report_class, p_locale,
      p_parameters, p_overrides, p_layout_ast, v_hash, 'published', current_date, p_actor)
    returning id into v_id;
  -- The on-behalf-of and wake-kind columns come from the CALLER's lane, so a wake-drafted spec is
  -- distinguishable in the audit log from a human-drafted one without a second writer.
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'draft_report_spec', null,
    jsonb_build_object('report_spec_id', v_spec, 'version_id', v_id, 'client', p_client));
  return clara._finish_op(p_firm, 'draft_report_spec', p_op_key,
    jsonb_build_object('report_spec_id', v_spec, 'report_spec_version_id', v_id, 'revision', v_rev,
      'report_class', t.report_class, 'content_sha256', encode(v_hash, 'hex'), 'layout', v_shape));
end $$;
revoke all on function clara._draft_report_spec_core(uuid, uuid, uuid, text, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, text) from public;

-- THE HUMAN DOOR. Signature unchanged, so no caller moves; it resolves the context and delegates.
create function clara.draft_report_spec(
    p_client uuid, p_spec_key text, p_title text, p_report_template_version_id uuid,
    p_locale text, p_parameters jsonb, p_overrides jsonb, p_layout_ast jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._draft_report_spec_core(c.actor, c.firm, null, null, p_client, p_spec_key, p_title,
    p_report_template_version_id, p_locale, p_parameters, p_overrides, p_layout_ast, p_op_key);
end $$;
revoke all on function clara.draft_report_spec(uuid, text, text, uuid, text, jsonb, jsonb, jsonb, text) from public;

reset role;

-- GRANT CLASS (a): human writers, clara_authenticated ONLY (0004:766-780).
grant execute on function
  clara.publish_house_style_version(text, text, jsonb, jsonb, date, text),
  clara.publish_report_template_version(text, text, text, text, uuid, uuid, jsonb, date, text),
  clara.publish_chart_template_version(text, text, jsonb, date, text),
  clara.draft_report_spec(uuid, text, text, uuid, text, jsonb, jsonb, jsonb, text)
  to clara_authenticated;

do $tail$
declare v_fns int; v_wrong int; v_granted text;
begin
  select count(*) into v_fns from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['publish_house_style_version', 'publish_report_template_version',
     'publish_chart_template_version', 'draft_report_spec']);
  if v_fns <> 4 then
    raise exception 'epsilon security tail: % of 4 publishing verbs exist', v_fns using errcode = 'CLR10';
  end if;
  -- Definer + owner + pinned search_path on every one, read from pg_proc.
  select count(*) into v_wrong from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['publish_house_style_version', 'publish_report_template_version',
     'publish_chart_template_version', 'draft_report_spec'])
   and (not p.prosecdef or p.proowner <> 'clara_fn_owner'::regrole
        or p.proconfig is distinct from array['search_path=clara, pg_temp']);
  if v_wrong <> 0 then
    raise exception 'epsilon security tail: % publishing verb(s) lack the definer/owner/pinned-path posture', v_wrong
      using errcode = 'CLR10';
  end if;
  -- The grantee set, read POSITIVELY from the live ACLs: exactly clara_authenticated, four
  -- times, and nothing else.
  select coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), '(none)') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) a join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace and a.privilege_type = 'EXECUTE'
     and p.proname = any (array['publish_house_style_version', 'publish_report_template_version',
       'publish_chart_template_version', 'draft_report_spec'])
     and r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner';
  if v_granted <> 'clara_authenticated' then
    raise exception 'epsilon security tail: publishing-verb grantees are [%], expected exactly clara_authenticated', v_granted
      using errcode = 'CLR10';
  end if;
  -- THE DRAFTING SPLIT, read from prosrc rather than assumed: the drafting judgement lives in the
  -- CORE, the wrapper only resolves a human, and the core is reachable by no app role. If a check
  -- were copied back into the wrapper there would be two drafting rules to keep in step -- which
  -- is exactly the drift the split exists to prevent.
  select count(*) into v_wrong from pg_proc p
   where p.oid = 'clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,text)'::regprocedure
     and (p.prosrc !~ '_draft_report_spec_core' or p.prosrc !~ '_human_ctx'
          or p.prosrc ~ 'report_template_version_not_in_firm' or p.prosrc ~ '_validate_layout_ast_v1');
  if v_wrong <> 0 then
    raise exception 'epsilon security tail: the draft wrapper is not a thin delegator' using errcode = 'CLR10';
  end if;
  select count(*) into v_wrong from pg_proc p
   where p.oid = 'clara._draft_report_spec_core(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,jsonb,jsonb,text)'::regprocedure
     and (p.prosrc ~ '_human_ctx' or p.prosrc !~ 'report_template_version_not_in_firm'
          or p.prosrc !~ '_validate_layout_ast_v1' or p.prosrc !~ 'client_not_in_firm');
  if v_wrong <> 0 then
    raise exception 'epsilon security tail: the draft core is not JWT-free or has lost a check' using errcode = 'CLR10';
  end if;
  select count(*) into v_wrong from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a join pg_roles r on r.oid = a.grantee
   where p.proname = '_draft_report_spec_core' and a.privilege_type = 'EXECUTE'
     and r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner';
  if v_wrong <> 0 then
    raise exception 'epsilon security tail: the draft core is granted to % app role(s)', v_wrong
      using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _epsilon_security_pre where k = 'deploy_principal') then
    raise exception 'epsilon security tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'epsilon publishing verbs OK: 4 verbs, each a clara_fn_owner SECURITY DEFINER with search_path=clara,pg_temp, granted to [%] and to nothing else. Floors: OWNER for the house style (E-R14 owner-sovereign), admin+ for a statutory template and bookkeeper+ for a management one (the SS6 split), bookkeeper+ for charts and spec drafts. A statutory template that omits a required section of its bound profile is refused at publish; a template may not claim compliance its profile cannot lend it; every asset must be content-addressed; the layout AST is validated at BOTH the template and the spec layer so an override cannot reintroduce what the template was refused for.',
    v_granted;
end $tail$;
