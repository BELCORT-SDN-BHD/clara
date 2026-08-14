-- 0077_wave_e_eta_wake_wrappers.sql -- Wave E lane eta (E-c), the ad-hoc authoring lane.
-- PART 1 of 2: the UNGRANTED MACHINERY. Number claimed at merge. Applies after the delta and
-- epsilon files. Add-only: no delta or epsilon object is recut, dropped or re-granted here.
--
-- ORDERING OBLIGATION, BINDING AND MECHANICAL, STATED IN BOTH HEADERS. This file creates the three
-- ungranted cores and grants NOTHING; 0078_wave_e_eta_wake_wrappers_part2.sql adds the
-- wrappers, the EXECUTE grants, the allowlist rows and the census that proves them, and its prestate
-- probes all three cores by exact regprocedure form so a wrong merge order fails loudly at apply.
-- The seam is deliberately between the machinery and the GRANTED SURFACE, not between objects and
-- their census: grant and proof-of-grant stay in one transaction, which is the atomicity that
-- matters. The residue of two transactions is named in part 2's header and is fail-safe by
-- construction -- between the halves the cores exist reachable by no role at all, so a database that
-- stops here has strictly less surface than one that applied neither half.
--
-- THE PRIVILEGE PATH, WHICH IS THE WHOLE POINT OF THIS FILE (design part2 section 11; the 0004:782-788
-- grant shape and the 0004:749-750 containment). Each writing chat tool reaches the database through
-- exactly ONE named wake wrapper: SECURITY DEFINER, pinned search_path, EXECUTE to
-- clara_wake_interactive and NOTHING else, one clara.wake_fn_allowlist row for 'interactive' and never
-- 'proactive'. The evaluator, the catalog writers and epsilon's report verbs stay ungranted to every
-- wake role; a wrapper reaches them as an internal ungranted call under clara_fn_owner.
--
-- WHY WRAPPER-PLUS-CORE, two independent structural reasons: (1) CONTAINMENT -- 0004:749-750 already
-- draws this line for the _*_core helpers, the granted surface resolving identity and the ungranted
-- core doing the write; (2) THE DELTA CENSUS -- delta's security tail and its catalog battery both
-- assert EXACTLY FOUR app-executable functions carry DML text against clara.metric_definitions /
-- clara.metric_definition_versions, pinned by prosrc sha256, and clara_wake_interactive is one of the
-- six roles they scan, so a granted wrapper carrying that DML would make it five and red delta's
-- contract wherever both lanes are applied. Every INSERT living in an ungranted core keeps the
-- measured count at four by construction rather than by luck.
--
-- WHY ETA AUTHORS CORES AT ALL. Delta ships no dual-lane split -- propose_metric_definition,
-- evaluate_metric_v1 and their siblings open with clara._human_ctx, which a wake credential cannot
-- satisfy -- and no delta entrypoint mints an ad-hoc composition cell. So these cores are the agent
-- lane's own, and they do NOT re-implement delta's judgement: they CALL delta's validator, normalizer,
-- selector resolver, algebra and hash builders, keeping the AST contract and the arithmetic
-- single-sourced. The one recomputed value (the displayed rounding) is re-derived independently by
-- clara._tf_metric_cell_integrity, which REFUSES on mismatch -- drift is caught, never absorbed.
--
-- The timeout is precautionary; every statement here is a bounded catalog write.
set local statement_timeout = '5min';

create temp table _eta_pre(k text primary key, v text not null) on commit drop;
insert into _eta_pre values ('deploy_user', current_user), ('deploy_role', current_role);

do $pre$
declare n text; v_writers int;
begin
  -- Delta's surface, positively read. Eta is a caller of these, never their author.
  -- The epsilon CORE is probed in its exact regprocedure form: an absent or renumbered core must
  -- refuse to APPLY here, not surface as a failure at the first wake invocation months later.
  foreach n in array array['clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)','clara.validate_metric_ast_v1(jsonb)',
    'clara._normalize_metric_node_v1(jsonb)','clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)',
    'clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)','clara._hash(jsonb)',
    'clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)',
    'clara.wake_context()','clara.assert_wake_allowed(text,text)','clara.agent_user_id()',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)','clara._reserve_op(uuid,text,text,bytea)',
    'clara._finish_op(uuid,text,text,jsonb)',
    'clara._draft_report_spec_core(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'eta prestate: required upstream function absent: %', n using errcode = 'CLR10';
    end if;
  end loop;
  foreach n in array array['metric_cells','metric_evaluation_contexts','metric_evaluation_context_periods',
    'metric_input_snapshots','metric_definition_versions','metric_definitions','wake_fn_allowlist',
    'report_spec_versions','edge_policy_sets','averaging_policy_versions'] loop
    if to_regclass('clara.'||n) is null then
      raise exception 'eta prestate: required upstream relation absent: clara.%', n using errcode = 'CLR10';
    end if;
  end loop;
  -- Partial birth. Every object this file creates must be absent.
  foreach n in array array[
    'clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)',
    'clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)',
    'clara.wake_request_report_preview(uuid,text)'
  ] loop
    if to_regprocedure(n) is not null then
      raise exception 'eta partial birth: % already exists', n using errcode = 'CLR10';
    end if;
  end loop;
  if exists(select 1 from clara.wake_fn_allowlist where function_name like 'wake\_%metric%' escape '\'
      or function_name like 'wake\_%report%' escape '\') then
    raise exception 'eta partial birth: an eta allowlist row already exists' using errcode = 'CLR10';
  end if;
  -- The delta census this file must NOT move. Measured before, re-measured in the tail.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_writers <> 4 then
    raise exception 'eta prestate: delta app-executable definition writers %, expected 4', v_writers using errcode = 'CLR10';
  end if;
  insert into _eta_pre values ('definition_writers', v_writers::text);
end $pre$;

set role clara_fn_owner;

-- ---------------------------------------------------------------------------------------------
-- A. THE UNGRANTED CORES. No wake role holds EXECUTE on any of these; they are reachable only
--    from the definer wrappers in section B, which run as clara_fn_owner.
-- ---------------------------------------------------------------------------------------------

-- A COMPOSITION PREVIEW, not a definition (design part2 section 11, "Composition vs new
-- definition", ruled). The cell records definition_version_id = NULL with formula_sha256
-- populated -- provenance field 1's own disjunction -- and delta's write-time wall
-- (clara._tf_metric_cell_integrity's definitionless branch) is what admits it. Statutory
-- eligibility requires a non-null definition version in canonical/firm_approved, so an ad-hoc
-- composition is barred from a statutory pack by that rule, not by a label this lane applies.
--
-- The preview mints its OWN run id, which belongs to no epsilon report run. That is the operative
-- reading of section 11's "cells with report_run_id null": clara.metric_cells carries no
-- report_run_id column, and clara.assess_report_claim selects contributing cells by
-- (client_id, run_id) against its own run, so a preview run is invisible to every claim assessment.
--
-- The snapshot is a REQUIRED argument and is never chosen here. Minting one is a bookkeeper-floor
-- human act (clara.mint_metric_input_snapshot_v1), and silently picking which immutable input a
-- preview reads would be this lane deciding an authoritative input. Absent, it refuses by name.
--
-- IT CARRIES AN OP KEY, unlike section 11's two-argument sketch. This lane runs inside a WDK
-- workflow step, and a replayed step re-executes its tool call; without an idempotency key a
-- replay mints a SECOND preview cell for the same request. Every other writer in this system
-- reserves on an op key for exactly that reason, and the chat lane's own version history is a
-- catalogue of replay defects. The snapshot id is required for the same family of reason: see
-- the paragraph above.
create function clara._eta_compose_metric_preview_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_ast jsonb, p_period_ids uuid[], p_snapshot_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare s record; ctx record; ev uuid; root_period uuid; root_start date; norm jsonb; comp jsonb;
  v clara.metric_value_v1; cell uuid; edge_id uuid; avg_id uuid; avg_key text; scale smallint;
  factor numeric; q numeric; rem numeric; shown text; na jsonb; reason_id uuid; run_id uuid; z jsonb;
begin
  if p_snapshot_id is null then
    raise exception 'a metric preview must name the immutable snapshot it reads'
      using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"snapshot_id","constraint":"nonnull","fix":"mint a metric input snapshot on the human lane and pass its id"}';
  end if;
  if p_period_ids is null or cardinality(p_period_ids) not between 1 and 25
     or array_position(p_period_ids, null) is not null
     or cardinality(array(select distinct x from unnest(p_period_ids) x)) <> cardinality(p_period_ids) then
    raise exception 'metric preview period binding invalid' using errcode = 'CLR10',
      detail = '{"reason":"cost_exceeded","class":"context_periods","limit":25}';
  end if;
  select * into s from clara.metric_input_snapshots
   where id = p_snapshot_id and client_id = p_client and firm_id = p_firm;
  if s.id is null or cardinality(p_period_ids) <> (select count(*) from clara.metric_input_snapshot_periods
      where snapshot_id = s.id and period_id = any(p_period_ids)) then
    raise exception 'metric preview snapshot/context binding incomplete' using errcode = 'CLR11';
  end if;
  -- Delta's validator is the ONE authority on the AST contract; eta never re-implements it.
  perform clara.validate_metric_ast_v1(p_ast);
  select id into ev from clara.evaluator_versions
   where evaluator_name = 'evaluate_metric' and version = 1 and firm_id is null and deployed;
  if ev is null then
    raise exception 'metric evaluator is not deployed' using errcode = 'CLR10',
      detail = '{"reason":"evaluator_undeployed"}';
  end if;
  select id into edge_id from clara.edge_policy_sets
   where policy_set_key = p_ast #>> '{edge_policy_set}' and (firm_id is null or firm_id = p_firm)
   order by firm_id nulls last, version desc limit 1;
  avg_key := 'avg_month_end_v1';
  select id into avg_id from clara.averaging_policy_versions
   where policy_key = avg_key and (firm_id is null or firm_id = p_firm) and implemented
   order by firm_id nulls last, version desc limit 1;
  if edge_id is null or avg_id is null then
    raise exception 'metric preview policy binding is absent' using errcode = 'CLR11',
      detail = '{"reason":"scope_mismatch","class":"composition_policies"}';
  end if;
  norm := (p_ast - 'root') || jsonb_build_object('root', clara._normalize_metric_node_v1(p_ast -> 'root'));
  -- The composition object is the cell's formula identity. Its shape is delta's, read from
  -- clara._tf_metric_cell_integrity's definitionless branch, which re-derives every clause below.
  comp := jsonb_build_object(
    'evaluator_entrypoint', (select entrypoint_signature from clara.evaluator_versions where id = ev),
    'ast', norm, 'allow_negative', false, 'averaging_policy', avg_key);
  z := clara._reserve_op(p_firm, 'wake_compose_metric_preview', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'composition', comp, 'periods', p_period_ids,
      'snapshot', p_snapshot_id)));
  if z is not null then return z; end if;
  run_id := gen_random_uuid();
  insert into clara.metric_evaluation_contexts(firm_id, client_id, snapshot_id, evaluator_version_id,
      run_id, context_sha256, created_by)
    values (p_firm, p_client, s.id, ev, run_id,
      clara._metric_context_sha256_v1(s.id, p_period_ids, p_firm, p_client, s.producer_version_id, ev,
        s.dataset_sha256, s.books_watermark), p_actor)
    returning * into ctx;
  insert into clara.metric_evaluation_context_periods
    select ctx.id, s.id, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord - 1
      from unnest(p_period_ids) with ordinality u(pid, ord)
      join clara.metric_input_snapshot_periods p on p.snapshot_id = s.id and p.period_id = u.pid;
  root_period := p_period_ids[1];
  select period_start into strict root_start from clara.metric_input_snapshot_periods
   where snapshot_id = s.id and period_id = root_period;
  v := clara._metric_eval_node_v1(p_client, s.id, ctx.id, root_period, norm -> 'root', false, avg_key, null);
  scale := (p_ast ->> 'result_scale')::smallint;
  if v.status <> 'ok' then
    -- Same period-effective resolution delta's writer and wall both use; disagreeing would be
    -- refused by clara._tf_metric_cell_integrity rather than silently persisted.
    select id into reason_id from clara.metric_na_reason_versions
     where reason_key = v.reason_key and firm_id is null and effective_from <= root_start
       and (effective_to is null or effective_to >= root_start) order by version desc limit 1;
    if reason_id is null then
      raise exception 'no N/A reason version is effective for the preview root period'
        using errcode = 'CLR10', detail = '{"reason":"scope_mismatch","class":"na_reason_effectivity"}';
    end if;
  else
    factor := power(10::numeric, scale);
    -- EXACT integer division, matching the wall term for term (delta F7, folded in). numeric division is inexact at ~16 significant digits while mod() is exact, so the old trunc(a*factor/den) drifted one ulp at large magnitudes -- and clara._tf_metric_cell_integrity re-derives this value and REFUSES on mismatch, so a divergence here is not a rounding nicety: it is a preview that cannot be written at all.
    q := div(abs(v.numerator) * factor, v.denominator);
    rem := mod(abs(v.numerator) * factor, v.denominator);
    if rem * 2 >= v.denominator then q := q + 1; end if;
    shown := to_char((case when v.numerator < 0 then -q else q end) / factor,
      'FM999999999999999999999999999999999999999999999999990' ||
      case when scale > 0 then '.' || repeat('0', scale) else '' end);
  end if;
  na := jsonb_build_object(
    'presentation_map_versions', jsonb_build_object('version', 1, 'reason', 'definition_has_no_presentation_map_binding'),
    'model_proposal', jsonb_build_object('version', 1, 'reason', 'evaluator_originated'),
    'human_approval', jsonb_build_object('version', 1, 'reason', 'no_numeric_approval'),
    'supersession', jsonb_build_object('version', 1, 'reason', 'first_mint'));
  if cardinality(v.document_ids) = 0 then
    na := na || jsonb_build_object('documents', jsonb_build_object('version', 1, 'reason', 'no_document-backed_input_rows'));
  end if;
  insert into clara.metric_cells(firm_id, client_id, run_id, evaluation_context_id, definition_version_id,
      formula_sha256, resolved_inputs_sha256, evaluator_version_id, books_watermark, cell_status,
      na_reason_version_id, exact_numerator, exact_denominator, unit_key, displayed_scale, displayed_text, inputs)
    values (p_firm, p_client, run_id, ctx.id, null, clara._hash(comp),
      clara._metric_resolved_inputs_sha256_v1(ctx.context_sha256, p_period_ids, p_firm, p_client, null,
        clara._hash(comp), v.account_set_version_ids, v.constant_version_ids, edge_id, avg_id, ev, s.books_watermark),
      ev, s.books_watermark, v.status, reason_id,
      case when v.status = 'ok' then v.numerator end, case when v.status = 'ok' then v.denominator end,
      case p_ast ->> 'unit' when 'currency' then 'money' else p_ast ->> 'unit' end,
      case when v.status = 'ok' then scale end, shown,
      coalesce(v.inputs, '{}') || jsonb_build_object(
        'normalized_provenance', jsonb_build_object('period_ids', p_period_ids, 'snapshot_ids', array[s.id],
          'account_set_version_ids', array(select x from unnest(v.account_set_version_ids) x order by x),
          'constant_version_ids', array(select x from unnest(v.constant_version_ids) x order by x),
          'entry_ids', array(select x from unnest(v.entry_ids) x order by x),
          'document_ids', array(select x from unnest(v.document_ids) x order by x),
          'presentation_map_version_ids', '{}'::uuid[]),
        'schema', 'clara.metric-composition-inputs/v1', 'provenance_not_applicable', na,
        'composition', comp))
    returning id into cell;
  insert into clara.metric_cell_periods
    select cell, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord - 1
      from unnest(p_period_ids) with ordinality u(pid, ord)
      join clara.metric_input_snapshot_periods p on p.snapshot_id = s.id and p.period_id = u.pid;
  insert into clara.metric_cell_snapshots values (cell, p_firm, p_client, s.id);
  insert into clara.metric_cell_account_sets select cell, p_firm, p_client, x from unnest(v.account_set_version_ids) x;
  insert into clara.metric_cell_constants select cell, p_firm, p_client, x from unnest(v.constant_version_ids) x;
  insert into clara.metric_cell_entries select cell, p_firm, p_client, x from unnest(v.entry_ids) x;
  insert into clara.metric_cell_documents select cell, p_firm, p_client, x from unnest(v.document_ids) x;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'wake_compose_metric_preview', null,
    jsonb_build_object('client', p_client, 'cell_id', cell, 'run_id', run_id, 'preview', true));
  return clara._finish_op(p_firm, 'wake_compose_metric_preview', p_op_key,
    jsonb_build_object('cell_id', cell, 'run_id', run_id, 'cell_status', v.status,
      'reason_key', v.reason_key, 'displayed_text', shown, 'definition_version_id', null,
      'formula_sha256', encode(clara._hash(comp), 'hex'), 'statutory_eligible', false, 'preview', true));
end $core$;
revoke all on function clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text) from public;

-- SAVING A COMPOSITION MINTS A DRAFT (ruled -- E-R5, design part2 section 11). Never
-- firm_approved: this core writes state 'draft' as a literal and holds no approval columns, so the
-- approval lane (clara.approve_metric_definition, admin floor, approver <> proposer) stays the only
-- path to an approved version. The proposer recorded is the AGENT user, which is what makes the
-- segregation check bite later: a human approving their own agent's draft is still a distinct human.
create function clara._eta_save_metric_definition_draft_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_client uuid, p_key text, p_title text,
    p_unit text, p_temporality text, p_result_scale smallint, p_ast jsonb, p_allow_negative boolean,
    p_applies_from date, p_applies_to date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare d uuid; v uuid; e uuid; av uuid; h bytea; norm jsonb; rev int; unit_key text; validated jsonb; z jsonb;
begin
  perform 1 from clara.clients where id = p_client and firm_id = p_firm;
  if not found then raise exception 'client not found in your firm' using errcode = 'CLR11'; end if;
  unit_key := case p_unit when 'currency' then 'money' else p_unit end;
  -- Delta's own structural validator, called not copied.
  validated := clara._validate_metric_ast_shape_v1(p_ast);
  if unit_key is distinct from validated ->> 'unit' or p_temporality is distinct from validated ->> 'temp'
     or p_result_scale is distinct from (validated ->> 'result_scale')::smallint then
    raise exception 'stored metric declarations do not match AST declarations' using errcode = 'CLR10',
      detail = '{"reason":"declaration_mismatch","fix":"make unit, temporality and result_scale match the validated AST"}';
  end if;
  select min(id::text)::uuid into e from clara.edge_policy_sets
   where policy_set_key = p_ast ->> 'edge_policy_set' and firm_id is null and effective_from <= p_applies_from
     and ((p_applies_to is null and effective_to is null) or (p_applies_to is not null and (effective_to is null or effective_to >= p_applies_to)));
  select min(id::text)::uuid into av from clara.averaging_policy_versions
   where policy_key = 'avg_month_end_v1' and firm_id is null and implemented and effective_from <= p_applies_from
     and ((p_applies_to is null and effective_to is null) or (p_applies_to is not null and (effective_to is null or effective_to >= p_applies_to)));
  if e is null or av is null then
    raise exception 'metric policy binding is absent or ambiguous for the draft' using errcode = 'CLR10',
      detail = '{"reason":"scope_mismatch","fix":"use registered edge and averaging policy versions whose windows cover applies_from through applies_to"}';
  end if;
  norm := (p_ast - 'root') || jsonb_build_object('root', clara._normalize_metric_node_v1(p_ast -> 'root'));
  h := clara._hash(jsonb_build_object('normalized_ast', norm, 'unit', unit_key, 'temporality', p_temporality,
    'result_scale', p_result_scale, 'edge_policy_set', p_ast ->> 'edge_policy_set', 'edge_policy_set_id', e,
    'averaging_policy', 'avg_month_end_v1', 'averaging_policy_id', av, 'allow_negative', coalesce(p_allow_negative, false)));
  z := clara._reserve_op(p_firm, 'wake_save_metric_definition_draft', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'key', p_key, 'normalized_ast', norm, 'unit', unit_key,
      'temporality', p_temporality, 'result_scale', p_result_scale, 'allow_negative', coalesce(p_allow_negative, false),
      'applies_from', p_applies_from, 'applies_to', p_applies_to)));
  if z is not null then return z; end if;
  select id into d from clara.metric_definitions where firm_id = p_firm and definition_key = p_key for update;
  if d is null then
    insert into clara.metric_definitions(firm_id, definition_key, title, created_by)
      values (p_firm, p_key, p_title, p_actor) returning id into d;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(d::text, 0));
  select coalesce(max(revision), 0) + 1 into rev from clara.metric_definition_versions where definition_id = d;
  insert into clara.metric_definition_versions(firm_id, definition_id, revision, ast, normalized_ast,
      formula_sha256, unit_key, temporality_key, result_scale, edge_policy_set_id, averaging_policy_id,
      allow_negative, state, applies_from, applies_to, proposed_by, proposal_evidence, approval_evidence)
    values (p_firm, d, rev, p_ast, norm, h, unit_key, p_temporality, p_result_scale, e, av,
      coalesce(p_allow_negative, false), 'draft', p_applies_from, p_applies_to, p_actor,
      jsonb_build_object('kind', 'agent_proposal', 'version', 1, 'client_id', p_client, 'wake_kind', p_wake_kind, 'on_behalf_of', p_obo),
      '{"kind":"not_applicable","version":1,"reason":"not_approved"}')
    returning id into v;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'wake_save_metric_definition_draft', null,
    jsonb_build_object('client', p_client, 'definition_version_id', v, 'op_key', p_op_key));
  return clara._finish_op(p_firm, 'wake_save_metric_definition_draft', p_op_key,
    jsonb_build_object('definition_version_id', v, 'revision', rev, 'state', 'draft',
      'formula_sha256', encode(h, 'hex')));
end $core$;
revoke all on function clara._eta_save_metric_definition_draft_core(uuid,uuid,uuid,text,uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text) from public;

-- THE RENDER PREVIEW IS DEFERRED OUT OF ETA v1, AND SAYS SO STRUCTURALLY (ruled 2026-08-14). Not for
-- want of an enqueue -- zeta's clara.enqueue_render_job(uuid,text) is frozen and ready -- but for what
-- stands between a spec draft and a render job. E-R8 floor 2 binds every render to a PERSISTED
-- dataset, so the lawful chain is open_report_run -> evaluate -> seal_report_dataset ->
-- enqueue_render_job(run_id,'draft_watermarked'), and every verb in it opens with clara._human_ctx,
-- which reads request.jwt.claims; a wake credential carries clara.wake_secret instead, so each raises
-- CLR04 before doing any work. The chain also mints REAL pack cells, and clara.evaluate_fs_pack_v1 is
-- human-bound by the owner's delta-v1 wake-identity ruling with its body frozen-deployed. The lawful
-- wake path is a context-validated OBO evaluator core shipping as a NEW evaluator closure through its
-- own ceremony -- eta's charter, not this version's bytes. Refusing by name is the honest shape.
create function clara._eta_request_report_preview_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_spec_draft_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare sv record;
begin
  select rsv.id, rsv.client_id, rsv.firm_id into sv from clara.report_spec_versions rsv
   where rsv.id = p_spec_draft_id and rsv.firm_id = p_firm;
  if sv.id is null then
    raise exception 'report spec draft not found in your firm' using errcode = 'CLR11';
  end if;
  raise exception 'an agent cannot request a report preview in this version'
    using errcode = 'CLR10', detail = jsonb_build_object('reason', 'report_preview_deferred',
      'class', 'render_preview_chain', 'report_spec_version_id', sv.id,
      'requested_kind', 'draft_watermarked',
      'blocked_on', jsonb_build_array('clara.open_report_run', 'clara.evaluate_fs_pack_v1', 'clara.seal_report_dataset'),
      'why', 'every verb in the open-evaluate-seal chain resolves a human JWT context, which a wake credential does not carry',
      'fix', 'run the chain on the HUMAN lane (open_report_run, evaluate, seal_report_dataset), or wait for the context-validated OBO evaluator core shipping as a new evaluator closure; the render kind stays draft_watermarked either way')::text;
end $core$;
revoke all on function clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text) from public;

reset role;

do $tail$
declare v_role text; v_writers int; v_sig text;
  v_cores text[] := array[
    'clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
    'clara._eta_save_metric_definition_draft_core(uuid,uuid,uuid,text,uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text)'];
begin
  if current_user <> (select v from _eta_pre where k = 'deploy_user')
     or current_role <> (select v from _eta_pre where k = 'deploy_role') then
    raise exception 'eta tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  -- Each core: definer, pinned search_path, and reachable by NO application role -- part 1 grants
  -- nothing, so this half's whole privilege claim is an ABSENCE, measured per role rather than
  -- assumed. The two NON-INHERITING login shells are named explicitly: a group-only probe cannot
  -- answer for clara_agent_read_login (0006) or clara_wake_write_login (0009).
  foreach v_sig in array v_cores loop
    if not exists(select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']) then
      raise exception 'eta tail: core posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_interactive','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'eta tail: % executes the ungranted core %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
    if exists(select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where f.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'eta tail: PUBLIC executes the core %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  -- No wrapper and no allowlist row may exist yet: those are part 2's, and their premature presence
  -- here would mean the halves were applied out of order.
  if exists(select 1 from clara.wake_fn_allowlist where function_name in ('wake_compose_metric_preview',
      'wake_save_metric_definition_draft','wake_draft_report_spec','wake_request_report_preview')) then
    raise exception 'eta tail: part 2 allowlist rows exist before part 1 finished' using errcode = 'CLR10';
  end if;
  -- The delta census must be exactly where the prestate found it. Part 1 grants nothing, so this
  -- number cannot have moved; measuring it here is what makes that a finding rather than a belief.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_writers <> (select v::int from _eta_pre where k = 'definition_writers') then
    raise exception 'eta tail: app-executable definition writers moved from % to %',
      (select v from _eta_pre where k = 'definition_writers'), v_writers using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.metric_cells where inputs ->> 'schema' = 'clara.metric-composition-inputs/v1') <> 0 then
    raise exception 'eta tail: the migration seeded a composition cell, expected 0' using errcode = 'CLR10';
  end if;
  raise notice 'eta part1 OK: 3 ungranted cores, definer + pinned search_path, reachable by NO application role incl. both non-inheriting login shells and not by PUBLIC; nothing granted and no allowlist row written by this half; delta definition-writer census unmoved at %; zero cells seeded. 0078_wave_e_eta_wake_wrappers_part2.sql adds the granted surface and MUST follow.', v_writers;
end $tail$;
