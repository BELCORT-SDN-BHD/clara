-- 0068_wave_e_epsilon_reporting_schema_validators.sql -- Wave E lane epsilon, file 4 of 8.
--
-- Applies after 0067_wave_e_epsilon_reporting_registry_seeds.sql and before
-- 0069_wave_e_epsilon_reporting_security.sql. Number claims at MERGE; the timeout is
-- PRECAUTIONARY. (Seven files, not two, because of the repo's 500-line discipline -- the
-- lane-delta four-file split is the precedent; the file names sort into apply order.)
--
-- THE CLOSED-SCHEMA VALIDATORS. Every one is INTERNAL: revoked from public, granted to no app
-- role, reachable only through the audited verbs in the two files that follow.
--
--   V1  clara._layout_structural_int_fields   -- the CLOSED structural-integer allow-list.
--   V2  clara._validate_layout_ast_v1         -- E-R8 floor 1: NO numeric literal node, only
--                                                structural integers; no protected content typed
--                                                into the one display-text leaf; and no protected
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
  if to_regprocedure('clara._validate_layout_ast_v1(jsonb,text)') is not null then
    raise exception 'epsilon validators partial birth: clara._validate_layout_ast_v1 already exists'
      using errcode = 'CLR10';
  end if;
  -- The author-text wall reads the claim lexicon as DATA. If it is unseeded the wall would be
  -- silently empty on its claim-wording family, so this file refuses to deploy over an
  -- unseeded lexicon rather than shipping a wall with a hole in it.
  if (select count(*) from clara.claim_phrase_lexicon) = 0 then
    raise exception 'epsilon validators: the claim-phrase lexicon is not seeded' using errcode = 'CLR10';
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

create function clara._validate_layout_ast_v1(p_ast jsonb, p_scope text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  todo jsonb[]; n jsonb; k text; i int := 1;
  ints text[] := clara._layout_structural_int_fields();
  allowed text[]; required text[]; kk text; vv jsonb; child jsonb;
  v_sections text[] := '{}'; v_placeholders text[] := '{}'; v_metrics text[] := '{}';
  v_charts text[] := '{}'; v_nodes int := 0; v_binds text; s jsonb;
  v_text text; v_family text; v_shape text;
begin
  -- SCOPE IS EXPLICIT, NEVER DEFAULTED. It selects which half of the author-text wall applies,
  -- so a caller that forgot to say which layer it is publishing gets a refusal rather than the
  -- weaker of the two walls. `template` is the publish-gated layer, `spec` the draft layer.
  if p_scope is null or p_scope not in ('template', 'spec') then
    raise exception 'layout validation scope is not registered' using errcode = 'CLR10',
      detail = '{"reason":"validation_scope_unknown","fix":"validate a layout at scope template or spec"}';
  end if;
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

    -- =================================================================================
    -- THE AUTHOR-TEXT WALL. `text.value` is the ONE display-text leaf this grammar has: every
    -- other string a node carries -- section_key, and the placeholder / metric / chart / note /
    -- wording keys -- is a KEY resolved against a DB row, and a key never reaches paper as
    -- itself. So scanning `value` is not a SAMPLE of the author's text; structurally it IS the
    -- author's text, which is what lets this wall be stated as a closed claim over the layer
    -- rather than as a best effort.
    --
    -- TWO FAMILIES, TWO SCOPES.
    --   PROTECTED IDENTITY fires at BOTH scopes. Enforcement here is UNCONDITIONAL -- it does
    --   not wait for the author to declare `binds`, because an author who hard-codes an entity
    --   name simply omits the field. A hard-coded registration number or legal name in a
    --   TEMPLATE is the worse case, not the excused one: the template is reused across every
    --   client bound to it.
    --   CURRENCY SHAPE now fires at BOTH scopes too. It was ruled spec-only on the reasoning
    --   that template text is publish-gated behind a role floor and a maker's act -- but a role
    --   floor proves a human published it, not that what they published was a figure they were
    --   entitled to type, and a template is reused across EVERY client bound to it. A hard-coded
    --   amount there is the same harm as a hard-coded name, multiplied the same way. There is no
    --   lawful use for a currency amount in a template: every figure on the face of a statement
    --   resolves through metric_ref. (Widening ruled 2026-08-14 with the orchestrator, on the
    --   independent review's finding that "RM 125,000" published into a template passed.)
    --
    -- HONEST LIMITS, STATED RATHER THAN HIDDEN. This is a MISTAKE-NET over one leaf, not the
    -- containment. It does NOT catch a spelled-out numeral ("one hundred and twenty five
    -- thousand"), a bare four-digit run (indistinguishable from a year), a foreign-language
    -- legal-entity suffix, or a transliterated entity name.
    --
    -- AND IT DOES NOT CATCH A BARE SMALL DECIMAL ("12.50"), WHICH IS A DELIBERATE LIMIT RATHER
    -- THAN AN OVERSIGHT, because the alternative is worse. "12.50" and "Section 2.14" are the
    -- same shape; nothing in the string says which is money. The ruling keeps section, note and
    -- paragraph references lawful, so a rule that caught the first would refuse the second -- and
    -- refusing an author's lawful cross-reference teaches them the wall is noise, which is how a
    -- wall stops being read. The wall therefore catches a decimal only where the string ITSELF
    -- carries evidence of money: a currency marker, or an integer part too large to be a
    -- reference. Lawful reference shapes stay lawful by construction: "FY2025", "Note 12",
    -- "2026-08-13", "Section 2.14".
    --
    -- The CONTAINMENT is structural and lives elsewhere -- every figure on the face of a
    -- statement resolves through metric_ref/placeholder, and E-R8's JSON-number allow-list above
    -- refuses the numeric node outright.
    -- =================================================================================
    if k = 'text' then
      if jsonb_typeof(n->'value') <> 'string' then
        raise exception 'layout text value must be a string' using errcode = 'CLR10',
          detail = '{"reason":"unknown_field","fix":"a text node carries a string value"}';
      end if;
      v_text := n->>'value';
      v_family := null; v_shape := null;
      -- (1) PROTECTED IDENTITY -- both scopes. The six-or-more digit run is one rule serving two
      -- protected families at once: no lawful label carries six consecutive digits (a year is
      -- four, a note reference one to three, a date is grouped), so such a run is either a
      -- registered identifier or a figure -- and both resolve from the DB, never from typing.
      if v_text ~ '[0-9]{6,}' then
        v_family := 'registration_identifiers'; v_shape := 'digit_run_6plus';
      elsif v_text ~* '(^|[^[:alnum:]])(SDN\.?[[:space:]]*BHD|BERHAD|BHD|PLT)([^[:alnum:]]|$)' then
        v_family := 'entity_legal_name'; v_shape := 'legal_entity_suffix';
      elsif exists (select 1 from clara.claim_phrase_lexicon l
                     where l.match_kind = 'substring_ci'
                       and position(lower(l.phrase) in lower(v_text)) > 0) then
        -- DATA-DRIVEN, not invented: the same lexicon lane zeta's gate-3 scan reads. Effective
        -- windows are deliberately IGNORED here -- a phrase that was ever the compliance claim
        -- is never lawful as typed text, and consulting a window would need a clock this
        -- function must not have (the x42 forbidden-clock family).
        v_family := 'claim_wording'; v_shape := 'claim_lexicon_phrase';
      end if;
      if v_family is not null then
        raise exception 'protected content may not be typed into a report layout' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'protected_content_typed', 'placeholder_key', v_family,
            'shape', v_shape, 'node', k, 'scope', p_scope,
            'fix', format('resolve %L from %s through a placeholder node, never as typed text',
              v_family, coalesce((select p.resolves_from from clara.protected_placeholders p
                                   where p.placeholder_key = v_family), 'the DB')))::text;
      end if;
      -- (2) CURRENCY SHAPE -- BOTH scopes. E-R4 in the string domain: a figure the deterministic
      -- evaluator never produced, wearing quotes.
      if v_text ~ '[0-9]{1,3}(,[0-9]{3})+' then v_shape := 'thousands_grouped';
      elsif v_text ~* '(^|[^[:alpha:]])(RM|MYR|USD|SGD|EUR|GBP)\.?[[:space:]]*[0-9]' then v_shape := 'currency_marked';
      elsif v_text ~ '[0-9]{4,}\.[0-9]{2}([^0-9]|$)' then v_shape := 'decimal_amount';
      else v_shape := null; end if;
      if v_shape is not null then
        raise exception 'a currency amount may not be typed into a report' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'string_encoded_numeral_forbidden', 'node', k,
            'shape', v_shape, 'scope', p_scope,
            'fix', 'every figure comes from the DB algebra -- reference it with a metric_ref or a placeholder, never as typed text')::text;
      end if;
    end if;

    -- THE PROTECTED-PLACEHOLDER ARM (SS7, publish-time half). A node that BINDS a protected
    -- placeholder must resolve it FROM THE DB: its content is exactly the placeholder node. A
    -- text node binding one, or a container whose content is a literal, is the smuggle this
    -- refuses -- and it refuses by NAME, so the message states the remedy. It is the DECLARED
    -- half of the wall; the block above is the undeclared half.
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
revoke all on function clara._validate_layout_ast_v1(jsonb, text) from public;

-- =====================================================================================
-- V3 -- THE CHART SPEC VALIDATOR, STAGE 1 (closed JSON-schema validation). "No inline values,
-- SQL, JS or user formulas" is ruled; the deny-list names each shape so the refusal tells the
-- author which law it hit, and the numeric allow-list closes the shapes nobody anticipated.
-- =====================================================================================
create function clara._validate_chart_spec_ast_v1(p_spec jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  x jsonb; kk text; vv jsonb; v_series text[] := '{}'; v_versions uuid[] := '{}';
  v_series_versions uuid[] := '{}'; v_threshold_versions uuid[] := '{}';
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
    v_series_versions := v_series_versions || (x->>'definition_version_id')::uuid;
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
    else
      v_versions := v_versions || (x->>'definition_version_id')::uuid;
      v_threshold_versions := v_threshold_versions || (x->>'definition_version_id')::uuid;
    end if;
  end loop;

  -- The series and threshold version lists are kept APART as well as unioned: stage 2 asks a
  -- different question of each (a threshold must match the axis the series define, not the other
  -- way round), and a single merged list cannot answer it.
  return jsonb_build_object('axis_policy', p_spec->>'axis_policy', 'series_keys', to_jsonb(v_series),
    'definition_version_ids', to_jsonb(v_versions), 'series_version_ids', to_jsonb(v_series_versions),
    'threshold_version_ids', to_jsonb(v_threshold_versions), 'constant_keys', to_jsonb(v_constants));
end $$;
revoke all on function clara._validate_chart_spec_ast_v1(jsonb) from public;

-- V4 -- STAGE 2: DB SEMANTIC VALIDATION. Every referenced version and constant must be visible
-- to THIS firm (product-curated rows carry firm_id null; anything else must be the caller's).
-- A foreign firm's metric version is refused as not-found-in-your-firm -- CLR11, no existence
-- oracle.
create function clara._validate_chart_spec_semantics_v1(p_firm uuid, p_spec jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_shape jsonb; v uuid; ck text; v_state text; v_seen int;
  v_dims int; v_temps int; v_from date; v_to date; v_temporality text; v_bad text;
  v_cur smallint; v_days smallint; v_cnt smallint;
  v_ccur smallint; v_cdays smallint; v_ccnt smallint; v_zero boolean;
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
  -- ===================================================================================
  -- AXIS COMPATIBILITY. Visibility and state say each series MAY be plotted; they say nothing
  -- about whether plotting them TOGETHER tells the truth. Money against a ratio, a stock
  -- (point_in_time) against a flow, or two series whose effective windows never overlap each
  -- render a picture that is individually sourced and jointly misleading -- E-R4's harm with a
  -- chart drawn around it. ONE AXIS, ONE DIMENSION, ONE TEMPORALITY, ONE SHARED WINDOW.
  --
  -- The dimension compared is delta's own (currency_power, days_power, count_power) triple, not
  -- the unit KEY: a later unit row that is money by another name stays compatible, and two keys
  -- that merely spell alike do not (review law 3 -- spelling is not identity).
  -- ===================================================================================
  select count(distinct (mu.currency_power, mu.days_power, mu.count_power)),
         count(distinct mv.temporality_key), max(mv.applies_from),
         min(mv.applies_to) filter (where mv.applies_to is not null)
    into v_dims, v_temps, v_from, v_to
    from jsonb_array_elements(v_shape->'series_version_ids') e
    join clara.metric_definition_versions mv on mv.id = (e#>>'{}')::uuid
    join clara.metric_units mu on mu.unit_key = mv.unit_key;
  if v_dims > 1 then
    raise exception 'chart series do not share a unit dimension' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'series_unit_incompatible', 'distinct_dimensions', v_dims,
        'fix', 'plot one dimension per chart -- money and ratio series need separate charts, not a shared axis')::text;
  end if;
  if v_temps > 1 then
    select string_agg(distinct mv.temporality_key, ',' order by mv.temporality_key) into v_temporality
      from jsonb_array_elements(v_shape->'series_version_ids') e
      join clara.metric_definition_versions mv on mv.id = (e#>>'{}')::uuid;
    raise exception 'chart series do not share a temporality' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'series_temporality_incompatible', 'temporalities', v_temporality,
        'fix', 'plot one temporality per chart -- a period-end balance and a period flow are different quantities')::text;
  end if;
  if v_to is not null and v_from > v_to then
    raise exception 'chart series effective windows do not overlap' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'series_effective_windows_disjoint',
        'latest_applies_from', v_from, 'earliest_applies_to', v_to,
        'fix', 'plot definition versions whose effective windows share at least one day')::text;
  end if;
  -- The axis dimension itself, read from any series (they are proven identical above).
  select mu.currency_power, mu.days_power, mu.count_power into v_cur, v_days, v_cnt
    from jsonb_array_elements(v_shape->'series_version_ids') e
    join clara.metric_definition_versions mv on mv.id = (e#>>'{}')::uuid
    join clara.metric_units mu on mu.unit_key = mv.unit_key
   limit 1;
  -- A threshold is drawn ON the axis, so it answers to the axis.
  select string_agg(distinct (e#>>'{}'), ',') into v_bad
    from jsonb_array_elements(v_shape->'threshold_version_ids') e
    join clara.metric_definition_versions mv on mv.id = (e#>>'{}')::uuid
    join clara.metric_units mu on mu.unit_key = mv.unit_key
   where (mu.currency_power, mu.days_power, mu.count_power)
         is distinct from (v_cur, v_days, v_cnt);
  if v_bad is not null then
    raise exception 'chart threshold does not share the axis dimension' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'threshold_unit_incompatible', 'definition_version_ids', v_bad,
        'fix', 'a threshold is drawn on the series axis -- give it the same unit dimension')::text;
  end if;

  foreach ck in array coalesce(
      array(select value#>>'{}' from jsonb_array_elements(v_shape->'constant_keys')), '{}'::text[]) loop
    select count(*), count(distinct (currency_power, days_power, count_power)),
           min(currency_power), min(days_power), min(count_power), bool_and(numerator = 0)
      into v_seen, v_dims, v_ccur, v_cdays, v_ccnt, v_zero
      from clara.metric_constants
     where constant_key = ck and (firm_id is null or firm_id = p_firm);
    if v_seen = 0 then
      raise exception 'chart threshold constant is not this firm''s' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'metric_constant_not_in_firm', 'constant_key', ck,
          'fix', 'reference a versioned constant this firm can see')::text;
    end if;
    -- FAIL-CLOSED on ambiguity. If the visible versions of a constant disagree about their
    -- dimension, no clock-free reading of this spec can say which one the chart means -- and
    -- this validator must have no clock (the x42 forbidden-clock family).
    if v_dims > 1 then
      raise exception 'chart threshold constant has more than one dimension' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'metric_constant_dimension_ambiguous', 'constant_key', ck,
          'fix', 'reference a constant whose visible versions agree on their dimension')::text;
    end if;
    -- ZERO IS DIMENSIONALLY NEUTRAL, and it is the one value that is. A zero baseline is
    -- meaningful on any axis -- nought ringgit and a nought ratio are the same point -- so a
    -- constant whose every visible version is zero-valued rides any dimension. Any OTHER
    -- dimensionless constant drawn on a money axis is a bare number on a money scale, which is
    -- precisely the misleading picture this refuses.
    if not v_zero and (v_ccur, v_cdays, v_ccnt) is distinct from (v_cur, v_days, v_cnt) then
      raise exception 'chart threshold constant does not share the axis dimension' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'threshold_unit_incompatible', 'constant_key', ck,
          'axis_dimension', format('(%s,%s,%s)', v_cur, v_days, v_cnt),
          'constant_dimension', format('(%s,%s,%s)', v_ccur, v_cdays, v_ccnt),
          'fix', 'a threshold is drawn on the series axis -- give it the same unit dimension, or reference a zero baseline')::text;
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

-- =====================================================================================
-- V6/V7 -- THE KEY SHAPES. Presence proves the render side CONSIDERED a key; it proves nothing
-- about what it wrote there. `extracted_text_sha256: null` is a manifest that looked at gate-3
-- extraction and recorded nothing, and a null that seals is evidence of nothing at all (review
-- law 2: absence is not evidence). So every required key also carries a SHAPE, and the roster is
-- CLOSED IN BOTH DIRECTIONS: a required key with no registered shape RAISES, which is what stops
-- the two lists drifting apart the next time a key is added.
--
-- `db_derived` is not a weaker shape -- it is a stronger one asserted elsewhere. Those keys are
-- compared value-for-value against the DB at seal (file 7), which also settles their
-- nullability: statutory_profile_sha256 is null for a management pack because the DB says the
-- pack has no profile, not because a null was tolerated here.
--
-- HOW THE TWO RULES COMPOSE, because they answer different questions and a reader will ask.
-- PRESENCE OF THE KEY IS ALWAYS REQUIRED -- that check runs first, for every key of every kind,
-- and no class licenses its absence. What a class licenses is the VALUE null, and only on the
-- two statutory-profile keys (statutory_profile_version_id, statutory_profile_sha256). That
-- licence is not written here as a conditional rule, because it does not have to be: file 1's
-- ck_rtv_statutory_profile is a BICONDITIONAL --
--   (report_class = 'statutory') = (statutory_profile_version_id is not null)
-- -- so the template's class and the presence of a profile are the SAME FACT, and re-deriving the
-- pin from the template answers the class question by reading the data rather than by asking it.
-- A management pack therefore seals with both keys null (the DB says null); a statutory pack with
-- them null refuses (the DB says a uuid and a hash); and a management pack claiming a profile
-- refuses for the mirror reason. All three land on manifest_binding_mismatch rather than
-- manifest_evidence_invalid, because the fault is a value that disagrees with the DB, not a shape
-- -- which is also why a class-conditional null rule HERE would be the weaker wall: it would
-- admit any well-formed uuid on a statutory pack, including a real profile version belonging to
-- some other template.
--
-- HONEST LIMIT, and the same one verify_report_artifact states: a well-shaped attestation is not
-- a true one. That a digest is 64 hex characters says nothing about whether those bytes ever
-- rendered. Lane zeta's gate-3 extraction and its double-render drill are where these become
-- facts; this wall only refuses the manifest that never tried.
-- =====================================================================================
create function clara._report_manifest_key_shape(p_key text) returns text
  language sql immutable as $$
  select case p_key
    when 'report_spec_version_id' then 'db_derived'
    when 'statutory_profile_version_id' then 'db_derived'
    when 'statutory_profile_sha256' then 'db_derived'
    when 'statutory_wording_sha256' then 'db_derived'
    when 'house_style_version_id' then 'db_derived'
    when 'house_style_sha256' then 'db_derived'
    when 'chart_spec_version_ids' then 'db_derived'
    when 'chart_spec_sha256' then 'db_derived'
    when 'books_snapshot_id' then 'db_derived'
    when 'dataset_id' then 'db_derived'
    when 'dataset_sha256' then 'db_derived'
    when 'report_parameters' then 'object'
    when 'applicability_receipts' then 'object'
    when 'claim_assessment' then 'object'
    -- A LIST, not a map: the evaluator versions a run ran under, and a run that ran under none
    -- rendered nothing. The dataset seal proves there is exactly one; an empty array here would
    -- contradict a fact the DB already holds.
    when 'evaluator_versions' then 'list'
    when 'definition_hashes' then 'object'
    when 'asset_hashes' then 'object'
    when 'document_metadata' then 'object'
    when 'signature_evidence' then 'evidence_object'
    when 'books_event_sequence' then 'text'
    when 'assembler_version' then 'text'
    when 'renderer_source_commit' then 'text'
    when 'node_version' then 'text'
    when 'os_version' then 'text'
    when 'architecture' then 'text'
    when 'font_engine_version' then 'text'
    when 'locale' then 'text'
    when 'timezone' then 'text'
    when 'extraction_tool' then 'text'
    when 'renderer_image_digest' then 'image_digest'
    when 'render_manifest_sha256' then 'sha256_hex'
    when 'extracted_text_sha256' then 'sha256_hex'
    when 'pre_sign_pdf_sha256' then 'sha256_hex'
    when 'signed_original_pdf_sha256' then 'sha256_hex'
    when 'uncertified' then 'boolean'
    else null end
$$;
revoke all on function clara._report_manifest_key_shape(text) from public;

create function clara._validate_report_manifest_shapes_v1(p_manifest jsonb, p_kind text) returns int
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare k text; s text; v jsonb; t text; n int := 0; bad boolean;
begin
  foreach k in array clara._report_manifest_required_keys(p_kind) loop
    s := clara._report_manifest_key_shape(k);
    if s is null then
      raise exception 'manifest key % has no registered shape', k using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'manifest_shape_unregistered', 'key', k,
          'fix', 'register a shape for every required manifest key -- the two rosters move together')::text;
    end if;
    n := n + 1;
    if s = 'db_derived' then continue; end if;
    v := p_manifest -> k;
    t := jsonb_typeof(v);
    if v is null or t = 'null' then
      raise exception 'the render manifest records no evidence at %', k using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'manifest_evidence_invalid', 'key', k,
          'expected', s, 'got', 'null',
          'fix', 'a null is evidence of nothing -- the render side attests this key or the seal refuses')::text;
    end if;
    bad := case s
      when 'sha256_hex'     then t <> 'string' or (v#>>'{}') !~ '^[0-9a-f]{64}$'
      when 'image_digest'   then t <> 'string' or (v#>>'{}') !~ '^(sha256:)?[0-9a-f]{64}$'
      when 'text'           then t <> 'string' or btrim(v#>>'{}') = ''
      when 'object'         then t <> 'object'
      when 'list'           then t <> 'array' or jsonb_array_length(v) = 0
      when 'evidence_object' then t <> 'object' or v = '{}'::jsonb
      when 'boolean'        then t <> 'boolean'
      else true end;
    if bad then
      raise exception 'the render manifest''s % is not a %', k, s using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'manifest_evidence_invalid', 'key', k,
          'expected', s, 'got', coalesce(t, 'null'),
          'fix', 'attest this key in its registered shape')::text;
    end if;
  end loop;
  return n;
end $$;
revoke all on function clara._validate_report_manifest_shapes_v1(jsonb, text) from public;

reset role;

do $tail$
declare v_fns int; v_grants int; v_base int; v_pre int; v_signed int; v_unshaped int;
begin
  select count(*) into v_fns from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['_layout_structural_int_fields', '_validate_layout_ast_v1',
     '_validate_chart_spec_ast_v1', '_validate_chart_spec_semantics_v1', '_report_manifest_required_keys',
     '_report_manifest_key_shape', '_validate_report_manifest_shapes_v1']);
  if v_fns <> 7 then
    raise exception 'epsilon validators tail: % of 7 validators exist', v_fns using errcode = 'CLR10';
  end if;
  -- INTERNAL means internal: no app role holds EXECUTE on any of them.
  select count(*) into v_grants from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace and a.privilege_type = 'EXECUTE'
     and p.proname = any (array['_layout_structural_int_fields', '_validate_layout_ast_v1',
       '_validate_chart_spec_ast_v1', '_validate_chart_spec_semantics_v1', '_report_manifest_required_keys',
       '_report_manifest_key_shape', '_validate_report_manifest_shapes_v1'])
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
  -- THE TWO ROSTERS ARE PROVEN TO MOVE TOGETHER, here, at deploy: every required key of every
  -- kind resolves to a registered shape. Without this a key added to one list and forgotten in
  -- the other would only surface as a seal refusal in front of a preparer.
  select count(*) into v_unshaped from (
    select k from unnest(clara._report_manifest_required_keys('draft_watermarked')) k
    union select k from unnest(clara._report_manifest_required_keys('pre_sign')) k
    union select k from unnest(clara._report_manifest_required_keys('signed_original')) k) q
   where clara._report_manifest_key_shape(q.k) is null;
  if v_unshaped <> 0 then
    raise exception 'epsilon validators tail: % required manifest key(s) carry no registered shape', v_unshaped
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _epsilon_validator_pre where k = 'deploy_principal') then
    raise exception 'epsilon validators tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'epsilon validators OK: layout AST refuses every non-structural JSON number (allow-list of 8 structural fields), every protected placeholder bound to a supplied literal, and -- UNCONDITIONALLY, at the one display-text leaf the grammar has -- typed registration identifiers, legal-entity suffixes, any claim-lexicon phrase and any typed currency amount, at BOTH scopes; an unregistered scope refuses outright. Chart AST refuses inline values/SQL/JS/formulas, ad-hoc axis bounds and literal thresholds over the WHOLE tree, admits only the four named axis policies and requires the same-source data table; stage 2 additionally holds one axis to one unit dimension, one temporality and one shared effective window, and holds every threshold to the axis dimension. The manifest key list is % keys for a draft, % for pre_sign, % for a signed original, and an unknown kind raises rather than returning an empty requirement -- and every one of those keys resolves to a registered SHAPE, so a null attestation refuses the seal instead of sealing over evidence of nothing. All 7 validators ungranted to every app role.',
    v_base, v_pre, v_signed;
end $tail$;
