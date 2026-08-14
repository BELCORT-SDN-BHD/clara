-- 0067_wave_e_epsilon_reporting_schema_validators.sql -- Wave E lane epsilon, file 4 of 7.
--
-- Applies after 0066_wave_e_epsilon_reporting_registry_seeds.sql and before
-- 0068_wave_e_epsilon_reporting_security.sql. Number claims at MERGE; the timeout is
-- PRECAUTIONARY. (Seven files, not two, because of the repo's 500-line discipline -- the
-- lane-delta four-file split is the precedent; the file names sort into apply order.)
--
-- THE CLOSED-SCHEMA VALIDATORS. Every one is INTERNAL: revoked from public, granted to no app
-- role, reachable only through the audited verbs in the two files that follow.
--
--   V1  clara._layout_structural_int_fields   -- the CLOSED structural-integer allow-list.
--   V2  clara._validate_layout_ast_v1         -- E-R8 floor 1: NO numeric literal node, only
--                                                structural integers; and no protected
--                                                placeholder bound to a user-supplied literal.
--   V3  clara._validate_chart_spec_ast_v1     -- SS8 stage 1: closed schema, no inline values /
--                                                SQL / JS / formulas, named axis policies only,
--                                                no ad-hoc bounds, no literal thresholds.
--   V4  clara._validate_chart_spec_semantics_v1 -- SS8 stage 2: every series and threshold
--                                                resolves inside the caller's firm.
--   V5  clara._report_manifest_required_keys  -- SS9's pin list VERBATIM + the two keys this
--                                                design adds. A missing key is a seal REFUSAL.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_validator_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_validator_pre values ('deploy_principal', session_user);

do $pre$
begin
  if to_regclass('clara.protected_placeholders') is null then
    raise exception 'epsilon validators require clara.protected_placeholders (files 1-3 not applied)'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.protected_placeholders) <> 8 then
    raise exception 'epsilon validators: the protected-placeholder list is not seeded' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._validate_layout_ast_v1(jsonb)') is not null then
    raise exception 'epsilon validators partial birth: clara._validate_layout_ast_v1 already exists'
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- V1/V2 -- THE LAYOUT AST VALIDATOR. E-R8 floor 1, bound mechanically: "the layout AST has NO
-- numeric literal node, only structural integers (column spans, row counts, font sizes); no
-- user and no model can type a number into a report in any layer, INCLUDING layer 6."
--
-- The rule is an ALLOW-LIST of structural-integer field names, not a deny-list of numeric
-- shapes. Any JSON number anywhere else in the tree -- at an unknown key, or bare inside an
-- array -- is refused. A deny-list would have to anticipate the smuggle; an allow-list makes
-- an unanticipated one fail closed.
-- =====================================================================================
create function clara._layout_structural_int_fields() returns text[]
  language sql immutable as $$
  select array['level', 'columns', 'column_span', 'row_span', 'ordinal', 'font_size_pt',
               'indent_level', 'decimal_places']
$$;
revoke all on function clara._layout_structural_int_fields() from public;

create function clara._validate_layout_ast_v1(p_ast jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  todo jsonb[]; n jsonb; k text; i int := 1;
  ints text[] := clara._layout_structural_int_fields();
  allowed text[]; required text[]; kk text; vv jsonb; child jsonb;
  v_sections text[] := '{}'; v_placeholders text[] := '{}'; v_metrics text[] := '{}';
  v_charts text[] := '{}'; v_nodes int := 0; v_binds text; s jsonb;
begin
  if p_ast is null or jsonb_typeof(p_ast) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_ast) q where q <> all (array['ast', 'sections']))
     or coalesce(p_ast->>'ast', '') <> 'clara.layout/v1'
     or not (p_ast ? 'sections') or jsonb_typeof(p_ast->'sections') <> 'array'
     or jsonb_array_length(p_ast->'sections') < 1 then
    raise exception 'layout top-level schema closed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply exactly clara.layout/v1 with a non-empty sections array"}';
  end if;
  if pg_column_size(p_ast) > 1048576 then
    raise exception 'layout AST exceeds the structural safety ceiling' using errcode = 'CLR10',
      detail = '{"reason":"structural_safety_ceiling","limit_bytes":1048576,"fix":"split the layout into fewer blocks"}';
  end if;

  for s in select value from jsonb_array_elements(p_ast->'sections') loop
    if jsonb_typeof(s) <> 'object'
       or exists (select 1 from jsonb_object_keys(s) q where q <> all (array['section_key', 'blocks']))
       or nullif(s->>'section_key', '') is null or jsonb_typeof(s->'blocks') <> 'array' then
      raise exception 'layout section schema closed' using errcode = 'CLR10',
        detail = '{"reason":"unknown_field","fix":"each section carries exactly section_key and a blocks array"}';
    end if;
    if s->>'section_key' = any (v_sections) then
      raise exception 'layout repeats section %', s->>'section_key' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'section_duplicated', 'section_key', s->>'section_key')::text;
    end if;
    v_sections := v_sections || (s->>'section_key');
    for child in select value from jsonb_array_elements(s->'blocks') loop
      todo := coalesce(todo, '{}'::jsonb[]) || child;
    end loop;
  end loop;

  while i <= coalesce(array_length(todo, 1), 0) loop
    n := todo[i]; i := i + 1; v_nodes := v_nodes + 1;
    if v_nodes > 4096 then
      raise exception 'layout AST exceeds the structural node ceiling' using errcode = 'CLR10',
        detail = '{"reason":"structural_safety_ceiling","class":"nodes","limit":4096,"fix":"reduce the layout to at most 4096 nodes"}';
    end if;
    if n is null or jsonb_typeof(n) <> 'object' or jsonb_typeof(n->'node') <> 'string'
       or nullif(n->>'node', '') is null then
      raise exception 'layout node malformed' using errcode = 'CLR10',
        detail = '{"reason":"unknown_field","fix":"every layout block is an object carrying a nonblank node tag"}';
    end if;
    k := n->>'node';
    -- THE CLOSED GRAMMAR. `binds` is optional wherever a container can carry it; it is the
    -- field a protected placeholder is bound through, and the arm further down is what refuses
    -- a literal in its place.
    if    k = 'heading'         then allowed := array['node','level','content','binds'];        required := array['content'];
    elsif k = 'paragraph'       then allowed := array['node','content','binds'];                required := array['content'];
    elsif k = 'statement_table' then allowed := array['node','columns','rows'];                 required := array['columns','rows'];
    elsif k = 'row'             then allowed := array['node','ordinal','cells'];                required := array['cells'];
    elsif k = 'cell'            then allowed := array['node','column_span','row_span','content','binds']; required := array['content'];
    elsif k = 'text'            then allowed := array['node','value','binds'];                  required := array['value'];
    elsif k = 'placeholder'     then allowed := array['node','key'];                            required := array['key'];
    elsif k = 'metric_ref'      then allowed := array['node','definition_key','decimal_places']; required := array['definition_key'];
    elsif k = 'chart_ref'       then allowed := array['node','chart_key'];                      required := array['chart_key'];
    elsif k = 'note_ref'        then allowed := array['node','note_key'];                       required := array['note_key'];
    elsif k = 'wording_ref'     then allowed := array['node','wording_key'];                    required := array['wording_key'];
    elsif k = 'page_break'      then allowed := array['node'];                                  required := '{}';
    else
      raise exception 'layout node % is not a registered kind', k using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'unknown_field', 'node', k,
          'fix', 'use a registered layout node kind')::text;
    end if;
    if exists (select 1 from jsonb_object_keys(n) q where q <> all (allowed)) then
      raise exception 'layout % schema closed', k using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'unknown_field', 'node', k,
          'fix', 'remove fields outside this node kind''s closed schema')::text;
    end if;
    foreach kk in array required loop
      if not (n ? kk) then
        raise exception 'layout % lacks required field %', k, kk using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'unknown_field', 'node', k, 'missing', kk,
            'fix', 'supply every required field of this node kind')::text;
      end if;
    end loop;

    -- E-R8 FLOOR 1. Every JSON number must sit at a STRUCTURAL field and be a whole number in
    -- range; anything else is a figure someone typed into a report.
    for kk, vv in select key, value from jsonb_each(n) loop
      if jsonb_typeof(vv) = 'number' then
        if not (kk = any (ints)) then
          raise exception 'numeric literal forbidden in a report layout' using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'numeric_literal_forbidden', 'node', k, 'field', kk,
              'fix', 'every figure comes from the DB algebra -- reference a metric, never type a number')::text;
        end if;
        if (vv#>>'{}')::numeric <> trunc((vv#>>'{}')::numeric)
           or (vv#>>'{}')::numeric < 0 or (vv#>>'{}')::numeric > 4096 then
          raise exception 'structural integer % is out of range', kk using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'structural_integer_invalid', 'field', kk,
              'fix', 'structural integers are whole numbers from 0 through 4096')::text;
        end if;
      elsif jsonb_typeof(vv) = 'array'
        and exists (select 1 from jsonb_array_elements(vv) e where jsonb_typeof(e) <> 'object') then
        raise exception 'layout % array carries a non-node element', kk using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'numeric_literal_forbidden', 'node', k, 'field', kk,
            'fix', 'every array element is a registered node object')::text;
      end if;
    end loop;

    -- THE PROTECTED-PLACEHOLDER ARM (SS7, publish-time half). A node that BINDS a protected
    -- placeholder must resolve it FROM THE DB: its content is exactly the placeholder node. A
    -- text node binding one, or a container whose content is a literal, is the smuggle this
    -- refuses -- and it refuses by NAME, so the message states the remedy.
    if n ? 'binds' then
      if jsonb_typeof(n->'binds') <> 'string' or nullif(n->>'binds', '') is null then
        raise exception 'layout binds must be a placeholder key' using errcode = 'CLR10',
          detail = '{"reason":"unknown_field","fix":"binds names a placeholder key"}';
      end if;
      v_binds := n->>'binds';
      if exists (select 1 from clara.protected_placeholders p where p.placeholder_key = v_binds) then
        if k = 'text' or not (n ? 'content') or jsonb_typeof(n->'content') <> 'object'
           or n#>>'{content,node}' is distinct from 'placeholder'
           or n#>>'{content,key}' is distinct from v_binds then
          raise exception 'protected placeholder % may not be bound to a supplied literal', v_binds
            using errcode = 'CLR10',
              detail = jsonb_build_object('reason', 'protected_placeholder_literal_binding',
                'placeholder_key', v_binds, 'node', k,
                'fix', format('bind %L to a placeholder node resolving from %s, never to typed text',
                  v_binds, (select p.resolves_from from clara.protected_placeholders p
                             where p.placeholder_key = v_binds)))::text;
        end if;
      end if;
    end if;

    if k = 'placeholder' then v_placeholders := v_placeholders || (n->>'key');
    elsif k = 'metric_ref' then v_metrics := v_metrics || (n->>'definition_key');
    elsif k = 'chart_ref' then v_charts := v_charts || (n->>'chart_key');
    end if;

    if n ? 'content' then
      if jsonb_typeof(n->'content') <> 'object' then
        raise exception 'layout % content must be a node object', k using errcode = 'CLR10',
          detail = '{"reason":"unknown_field","fix":"content is a single registered node object"}';
      end if;
      todo := todo || (n->'content');
    end if;
    foreach kk in array array['rows', 'cells'] loop
      if n ? kk then
        for child in select value from jsonb_array_elements(n->kk) loop todo := todo || child; end loop;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('sections', to_jsonb(v_sections), 'placeholders', to_jsonb(v_placeholders),
    'metric_keys', to_jsonb(v_metrics), 'chart_keys', to_jsonb(v_charts), 'nodes', v_nodes);
end $$;
revoke all on function clara._validate_layout_ast_v1(jsonb) from public;

-- =====================================================================================
-- V3 -- THE CHART SPEC VALIDATOR, STAGE 1 (closed JSON-schema validation). "No inline values,
-- SQL, JS or user formulas" is ruled; the deny-list names each shape so the refusal tells the
-- author which law it hit, and the numeric allow-list closes the shapes nobody anticipated.
-- =====================================================================================
create function clara._validate_chart_spec_ast_v1(p_spec jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  x jsonb; kk text; vv jsonb; v_series text[] := '{}'; v_versions uuid[] := '{}';
  v_constants text[] := '{}'; todo jsonb[]; i int := 1; n jsonb;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    raise exception 'chart spec must be an object' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply a clara.chart/v1 object"}';
  end if;

  -- DEEP SCAN FIRST, and deliberately BEFORE the closed key-set check. These families are named
  -- PROHIBITIONS (E-R14: no inline values, SQL, JS or user formulas; no ad-hoc axis bounds; no
  -- literal thresholds), not merely fields the grammar happens not to know -- so an author who
  -- tries one deserves the refusal that names the law, at whatever depth they tried it. Anything
  -- unknown but harmless still falls through to unknown_field below.
  todo := array[p_spec];
  while i <= coalesce(array_length(todo, 1), 0) loop
    n := todo[i]; i := i + 1;
    if jsonb_typeof(n) = 'object' then
      for kk, vv in select key, value from jsonb_each(n) loop
        if kk = any (array['values','data','sql','js','javascript','formula','expression','script']) then
          raise exception 'chart specs carry no inline values, SQL, JS or user formulas' using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'inline_value_forbidden', 'field', kk,
              'fix', 'every plotted series resolves to an approved metric version evaluated in the DB')::text;
        end if;
        if kk = any (array['min','max','y_min','y_max','axis_min','axis_max','clip']) then
          raise exception 'chart axis bounds come from a named policy, never an ad-hoc value' using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'axis_bound_adhoc_forbidden', 'field', kk,
              'fix', 'use axis_policy; a renderer free to choose a clip is number injection with a picture around it')::text;
        end if;
        if kk = 'value' then
          raise exception 'chart thresholds reference DB rows, never literals' using errcode = 'CLR10',
            detail = '{"reason":"threshold_literal_forbidden","fix":"reference a metric_constant key or an approved metric version"}';
        end if;
        if jsonb_typeof(vv) = 'number' and kk <> 'ordinal' then
          raise exception 'numeric literal forbidden in a chart spec' using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'numeric_literal_forbidden', 'field', kk,
              'fix', 'thresholds and targets reference metric versions or versioned constants')::text;
        end if;
        if jsonb_typeof(vv) in ('object', 'array') then todo := todo || vv; end if;
      end loop;
    elsif jsonb_typeof(n) = 'array' then
      for x in select value from jsonb_array_elements(n) loop
        if jsonb_typeof(x) = 'number' then
          raise exception 'numeric literal forbidden in a chart spec' using errcode = 'CLR10',
            detail = '{"reason":"numeric_literal_forbidden","fix":"reference metric versions or versioned constants"}';
        end if;
        if jsonb_typeof(x) in ('object', 'array') then todo := todo || x; end if;
      end loop;
    end if;
  end loop;

  -- Now the closed grammar, once the named prohibitions are out of the way.
  if exists (select 1 from jsonb_object_keys(p_spec) q
              where q <> all (array['ast','chart_kind','axis_policy','series','thresholds','data_table']))
     or coalesce(p_spec->>'ast', '') <> 'clara.chart/v1'
     or coalesce(p_spec->>'chart_kind', '') not in ('line', 'bar', 'stacked_bar', 'area')
     or jsonb_typeof(p_spec->'series') <> 'array' or jsonb_array_length(p_spec->'series') < 1
     or jsonb_typeof(p_spec->'thresholds') <> 'array' then
    raise exception 'chart top-level schema closed' using errcode = 'CLR10',
      detail = '{"reason":"unknown_field","fix":"supply exactly the six clara.chart/v1 fields with a non-empty series array"}';
  end if;
  -- NAMED AXIS POLICIES ONLY (ruled): no arbitrary clipping.
  if coalesce(p_spec->>'axis_policy', '') not in ('include_zero','data_extent','symmetric','disclosed_manual') then
    raise exception 'chart axis policy is not one of the named policies' using errcode = 'CLR10',
      detail = '{"reason":"axis_policy_unknown","fix":"use include_zero, data_extent, symmetric or disclosed_manual"}';
  end if;
  -- Every chart carries an accessible same-source data table (ruled). Not opt-out.
  if p_spec->'data_table' is distinct from 'true'::jsonb then
    raise exception 'every chart carries an accessible same-source data table' using errcode = 'CLR10',
      detail = '{"reason":"data_table_required","fix":"set data_table true; the table is generated from the same persisted dataset points"}';
  end if;

  for x in select value from jsonb_array_elements(p_spec->'series') loop
    if jsonb_typeof(x) <> 'object'
       or exists (select 1 from jsonb_object_keys(x) q where q <> all (array['series_key','definition_version_id']))
       or nullif(x->>'series_key', '') is null or nullif(x->>'definition_version_id', '') is null then
      raise exception 'chart series schema closed' using errcode = 'CLR10',
        detail = '{"reason":"unknown_field","fix":"each series carries exactly series_key and definition_version_id"}';
    end if;
    if x->>'series_key' = any (v_series) then
      raise exception 'chart repeats series %', x->>'series_key' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'series_duplicated', 'series_key', x->>'series_key')::text;
    end if;
    v_series := v_series || (x->>'series_key');
    v_versions := v_versions || (x->>'definition_version_id')::uuid;
  end loop;

  for x in select value from jsonb_array_elements(p_spec->'thresholds') loop
    if jsonb_typeof(x) <> 'object'
       or exists (select 1 from jsonb_object_keys(x) q
                   where q <> all (array['threshold_key','source','constant_key','definition_version_id']))
       or nullif(x->>'threshold_key', '') is null
       or coalesce(x->>'source', '') not in ('metric_constant', 'metric_version')
       or (x->>'source' = 'metric_constant' and (nullif(x->>'constant_key', '') is null or x ? 'definition_version_id'))
       or (x->>'source' = 'metric_version' and (nullif(x->>'definition_version_id', '') is null or x ? 'constant_key')) then
      raise exception 'chart threshold schema closed' using errcode = 'CLR10',
        detail = '{"reason":"threshold_literal_forbidden","fix":"a threshold names exactly one DB source: a metric_constant key or an approved definition version"}';
    end if;
    if x->>'source' = 'metric_constant' then v_constants := v_constants || (x->>'constant_key');
    else v_versions := v_versions || (x->>'definition_version_id')::uuid; end if;
  end loop;

  return jsonb_build_object('axis_policy', p_spec->>'axis_policy', 'series_keys', to_jsonb(v_series),
    'definition_version_ids', to_jsonb(v_versions), 'constant_keys', to_jsonb(v_constants));
end $$;
revoke all on function clara._validate_chart_spec_ast_v1(jsonb) from public;

-- V4 -- STAGE 2: DB SEMANTIC VALIDATION. Every referenced version and constant must be visible
-- to THIS firm (product-curated rows carry firm_id null; anything else must be the caller's).
-- A foreign firm's metric version is refused as not-found-in-your-firm -- CLR11, no existence
-- oracle.
create function clara._validate_chart_spec_semantics_v1(p_firm uuid, p_spec jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_shape jsonb; v uuid; ck text; v_state text; v_seen int;
begin
  v_shape := clara._validate_chart_spec_ast_v1(p_spec);
  for v in select (value#>>'{}')::uuid from jsonb_array_elements(v_shape->'definition_version_ids') loop
    select mv.state into v_state from clara.metric_definition_versions mv
      join clara.metric_definitions md on md.id = mv.definition_id
     where mv.id = v and (md.firm_id is null or md.firm_id = p_firm);
    if not found then
      raise exception 'chart series metric version is not this firm''s' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'metric_version_not_in_firm', 'definition_version_id', v,
          'fix', 'plot a canonical definition or one this firm approved')::text;
    end if;
    if v_state not in ('canonical', 'firm_approved', 'draft') then
      raise exception 'chart series metric version is % and cannot be plotted', v_state using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'metric_version_state_ineligible', 'state', v_state,
          'fix', 'plot a canonical, firm_approved or draft definition -- superseded and rejected never plot')::text;
    end if;
  end loop;
  foreach ck in array coalesce(
      array(select value#>>'{}' from jsonb_array_elements(v_shape->'constant_keys')), '{}'::text[]) loop
    select count(*) into v_seen from clara.metric_constants
     where constant_key = ck and (firm_id is null or firm_id = p_firm);
    if v_seen = 0 then
      raise exception 'chart threshold constant is not this firm''s' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'metric_constant_not_in_firm', 'constant_key', ck,
          'fix', 'reference a versioned constant this firm can see')::text;
    end if;
  end loop;
  return v_shape;
end $$;
revoke all on function clara._validate_chart_spec_semantics_v1(uuid, jsonb) from public;

-- =====================================================================================
-- V5 -- SS9's PIN LIST, CARRIED VERBATIM (14 lines) PLUS THE TWO KEYS THIS DESIGN ADDS: the
-- gate-3 extracted-text sha256 and the extraction tool's name + exact version as pinned in the
-- renderer image. Each is a REQUIRED key; A MISSING KEY IS A SEAL REFUSAL, NOT A DEFAULT.
-- PRESENCE is what is required -- a JSON null is a positive statement of "none" (a management
-- pack HAS no statutory profile), while an absent key is a manifest that never considered the
-- question. That distinction is Law 2 in one line.
-- =====================================================================================
create function clara._report_manifest_required_keys(p_kind text) returns text[]
  language plpgsql immutable as $$
declare base text[] := array[
  'report_spec_version_id', 'report_parameters',
  'statutory_profile_version_id', 'statutory_profile_sha256', 'statutory_wording_sha256',
  'house_style_version_id', 'house_style_sha256', 'chart_spec_version_ids', 'chart_spec_sha256',
  'books_snapshot_id', 'books_event_sequence',
  'dataset_id', 'dataset_sha256',
  'applicability_receipts', 'claim_assessment',
  'evaluator_versions', 'definition_hashes',
  'assembler_version',
  'renderer_image_digest', 'renderer_source_commit',
  'node_version', 'os_version', 'architecture', 'font_engine_version',
  'asset_hashes',
  'locale', 'timezone', 'document_metadata',
  'render_manifest_sha256',
  'extracted_text_sha256', 'extraction_tool',
  'uncertified'];
begin
  if p_kind = 'draft_watermarked' then return base; end if;
  if p_kind = 'pre_sign' then return base || array['pre_sign_pdf_sha256']; end if;
  if p_kind = 'signed_original' then
    return base || array['pre_sign_pdf_sha256', 'signed_original_pdf_sha256', 'signature_evidence'];
  end if;
  -- FAIL-CLOSED. An unknown kind gets no key list it could satisfy, so the seal refuses rather
  -- than sealing against an empty requirement.
  raise exception 'unknown artifact kind %', p_kind using errcode = 'CLR10',
    detail = jsonb_build_object('reason', 'artifact_kind_unknown', 'kind', p_kind)::text;
end $$;
revoke all on function clara._report_manifest_required_keys(text) from public;

reset role;

do $tail$
declare v_fns int; v_grants int; v_base int; v_pre int; v_signed int;
begin
  select count(*) into v_fns from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['_layout_structural_int_fields', '_validate_layout_ast_v1',
     '_validate_chart_spec_ast_v1', '_validate_chart_spec_semantics_v1', '_report_manifest_required_keys']);
  if v_fns <> 5 then
    raise exception 'epsilon validators tail: % of 5 validators exist', v_fns using errcode = 'CLR10';
  end if;
  -- INTERNAL means internal: no app role holds EXECUTE on any of them.
  select count(*) into v_grants from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace and a.privilege_type = 'EXECUTE'
     and p.proname = any (array['_layout_structural_int_fields', '_validate_layout_ast_v1',
       '_validate_chart_spec_ast_v1', '_validate_chart_spec_semantics_v1', '_report_manifest_required_keys'])
     and r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner';
  if v_grants <> 0 then
    raise exception 'epsilon validators tail: % app-role EXECUTE grant(s) on an internal validator', v_grants
      using errcode = 'CLR10';
  end if;
  -- The key list, counted by calling it -- not by re-reading the array literal above.
  v_base := array_length(clara._report_manifest_required_keys('draft_watermarked'), 1);
  v_pre := array_length(clara._report_manifest_required_keys('pre_sign'), 1);
  v_signed := array_length(clara._report_manifest_required_keys('signed_original'), 1);
  if v_base <> 32 or v_pre <> 33 or v_signed <> 35 then
    raise exception 'epsilon validators tail: manifest key counts %/%/% -- expected 32/33/35',
      v_base, v_pre, v_signed using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _epsilon_validator_pre where k = 'deploy_principal') then
    raise exception 'epsilon validators tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'epsilon validators OK: layout AST refuses every non-structural JSON number (allow-list of 8 structural fields) and every protected placeholder bound to a supplied literal; chart AST refuses inline values/SQL/JS/formulas, ad-hoc axis bounds and literal thresholds over the WHOLE tree, admits only the four named axis policies and requires the same-source data table; the manifest key list is % keys for a draft, % for pre_sign, % for a signed original, and an unknown kind raises rather than returning an empty requirement. All 5 validators ungranted to every app role.',
    v_base, v_pre, v_signed;
end $tail$;
