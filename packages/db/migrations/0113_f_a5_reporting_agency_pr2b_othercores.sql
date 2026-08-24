-- UNNUMBERED_f_a5_reporting_agency_pr2b_othercores.sql -- Wave F Track-A item F-A5, PR-2, file 2
-- of 5: create_account_set / requeue UNGRANTED CORES, plus the four typed-read cores. Applies
-- ONLY after pr2a_defcores.sql (which mints the pg_temp derivation helpers this file redeclares --
-- pg_temp is SESSION-scoped and a migration runner is not guaranteed to keep one connection open
-- across files, so this file does not assume pr2a's session survives).
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1, SS4-SS5 PR-2;
-- annexes reporting-agency-annexes-1-mechanics.md (A.1, A.2, A.3, C) and
-- reporting-agency-annexes-2-record.md (D, E-P7).
--
-- ============================ TWO MEASURED DIVERGENCES IN THIS FILE, FLAGGED FOR REVIEW (law 1) =
--
-- (1) clara.create_account_set_v1's human body calls NEITHER clara._audit NOR
--     clara._report_agent_receipt (rig-measured). The agent sibling core ADDS both, matching every
--     other F-A5 core's audit obligation, rather than re-aiming an existing call.
--
-- (2) clara.requeue_render_job's human body writes j.requested_by -- never a hardcoded null --
--     into _audit's on_behalf_of slot, deliberately ("it does not move authority ... the artifact
--     still seals on_behalf_of that person"). The extracted core PRESERVES that positional value
--     exactly and fills only the wake_kind slot (previously hardcoded null) with p_wake_kind; p_obo
--     (who DIRECTED Clara to requeue) rides the audit args as 'requeue_directed_by' instead, so no
--     information is lost either way. TA-P4's completeness claim is read as "never a hardcoded
--     NULL", satisfied without overwriting a value the human lane deliberately chose. E-P7: "the
--     requeue core is not extracted in PR-1" -- NON-D1 (no in-flight caller displaced; the human
--     verb stays byte-unmoved).
--
-- ============================ SECTION 0 -- PRESTATE ==============================================
do $s0$
declare v_missing text[] := '{}'; v_bad text[] := '{}'; v_present text[] := '{}'; v_sig text; v_sha text;
begin
  foreach v_sig in array array[
      'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()',
      'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)',
      'clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)',
      'clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)',
      'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2b prestate: pr2a object(s) absent -- apply pr2a_defcores.sql first: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;

  for v_sig, v_sha in
    select * from (values
      ('clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)','25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495'),
      ('clara.requeue_render_job(uuid,text,boolean)',                        'c045d6ba9afe7b890ecd911184099c691231193c33cf9f8262e2387aa3a3c759')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; continue; end if;
    if encode(sha256(convert_to((select prosrc from pg_proc where oid = v_sig::regprocedure),'UTF8')),'hex')
        is distinct from v_sha then v_bad := v_bad || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2b prestate: reference signature(s) absent: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;
  if coalesce(array_length(v_bad,1),0) > 0 then
    raise exception 'f_a5 pr2b prestate: reference body sha mismatch: %', array_to_string(v_bad,' | ') using errcode='CLR10';
  end if;

  foreach v_sig in array array[
      'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)',
      'clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)',
      'clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'f_a5 pr2b prestate: partial birth -- object(s) already present: %', array_to_string(v_present,' | ') using errcode='CLR10';
  end if;

  raise notice 'f_a5 pr2b prestate: clean -- 7 pr2a/PR-1 objects present, 2 reference bodies at pinned shas, 6 new objects absent';
end
$s0$;

create temporary table _fa5pr2b_pre (k text primary key, v text);
insert into _fa5pr2b_pre values ('deploy_user', current_user), ('deploy_role', current_role);
set role clara_fn_owner;

-- Re-declared (pr2a's pg_temp helpers are not assumed to survive the connection boundary between
-- migration files). Byte-identical to pr2a_defcores.sql's own copy.
create function pg_temp._fa5b_assert_no_wiki(p_label text, p_sql text) returns void
  language plpgsql as $nw$
begin
  if p_sql ~* '\mwiki[a-z0-9_]*\M'
     or p_sql ~* '\m(get_context_pack|run_client_lint|run_lint_all)\M' then
    raise exception 'f_a5 pr2 %: the derived body names a wiki relation or a wiki-touch verb', p_label
      using errcode = 'CLR10',
      detail = '{"reason":"wiki_authority_boundary","fix":"a reporting body may not reach the wiki surface; move the read into a whitelisted wiki verb"}';
  end if;
end
$nw$;

create function pg_temp._fa5b_derive(
    p_sig text, p_core_name text, p_ctx_anchor text, p_decl_anchor text,
    p_expect_c_actor int, p_expect_c_firm int, p_extra_args text default '')
  returns text language plpgsql as $ext$
declare v_body text; v_args text; v_ret text; v_new text; v_check text; v_expect text; v_n int;
begin
  select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    into v_body, v_args, v_ret from pg_proc p where p.oid = p_sig::regprocedure;

  if position('$fa5b$' in v_body) > 0 then
    raise exception 'f_a5 pr2 derive %: the body contains the dollar-quote tag this file uses', p_sig using errcode='CLR10';
  end if;
  if position('p_actor' in v_body) > 0 or position('p_firm' in v_body) > 0
     or position('p_obo' in v_body) > 0 or position('p_wake_kind' in v_body) > 0 then
    raise exception 'f_a5 pr2 derive %: the body already uses a name the substitution introduces', p_sig using errcode='CLR10';
  end if;

  v_n := (length(v_body) - length(replace(v_body, p_ctx_anchor, ''))) / length(p_ctx_anchor);
  if v_n <> 1 then raise exception 'f_a5 pr2 derive %: context anchor occurs % time(s), expected 1', p_sig, v_n using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, p_decl_anchor, ''))) / length(p_decl_anchor);
  if v_n <> 1 then raise exception 'f_a5 pr2 derive %: decl anchor occurs % time(s), expected 1', p_sig, v_n using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, 'c.actor', ''))) / length('c.actor');
  if v_n <> p_expect_c_actor then raise exception 'f_a5 pr2 derive %: c.actor occurs % time(s), rig measured %', p_sig, v_n, p_expect_c_actor using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, 'c.firm', ''))) / length('c.firm');
  if v_n <> p_expect_c_firm then raise exception 'f_a5 pr2 derive %: c.firm occurs % time(s), rig measured %', p_sig, v_n, p_expect_c_firm using errcode='CLR10'; end if;

  v_new := replace(v_body, p_ctx_anchor, '');
  v_new := replace(v_new, p_decl_anchor, '');
  v_new := replace(v_new, 'c.actor', 'p_actor');
  v_new := replace(v_new, 'c.firm', 'p_firm');

  v_check := replace(replace(v_new, 'p_actor', 'c.actor'), 'p_firm', 'c.firm');
  v_expect := replace(replace(v_body, p_ctx_anchor, ''), p_decl_anchor, '');
  if v_check is distinct from v_expect then
    raise exception 'f_a5 pr2 derive %: the reversal does not reconstruct the original body -- refusing to move it', p_sig using errcode='CLR10';
  end if;
  if position('_human_ctx' in v_new) > 0 then
    raise exception 'f_a5 pr2 derive %: residual _human_ctx reference survives the derivation', p_sig using errcode='CLR10';
  end if;

  perform pg_temp._fa5b_assert_no_wiki('derive ' || p_sig, v_new);
  return format(
    'create function clara.%I(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, %s%s) returns %s'
    || E' language plpgsql security definer set search_path = clara, pg_temp as $fa5b$%s$fa5b$',
    p_core_name, v_args, p_extra_args, v_ret, v_new);
end
$ext$;

-- ============================ SECTION 3 -- clara._agent_create_account_set_core =================
do $x3$
declare d text;
begin
  d := pg_temp._fa5b_derive('clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)',
        '_agent_create_account_set_core',
        E'c:=clara._human_ctx(clara.role_rank(\'admin\'));\n  ', 'c record;', 2, 8, ', p_agent jsonb default null');
  execute d;
  raise notice 'f_a5 pr2b #3: clara._agent_create_account_set_core derived and reversal-proven';
end
$x3$;

do $x3_fix$
declare d text; v_n int;
  key_from text := '''create_account_set_v1''';
  key_to   text := '''agent_create_account_set''';
  ret_from text := 'return clara._finish_op(p_firm,''agent_create_account_set'',p_op_key,jsonb_build_object(''account_set_id'',s,''account_set_version_id'',v,''revision'',next_revision));';
  ret_to   text := 'perform clara._report_agent_receipt(p_firm,p_client,null,null,''create_account_set'',''done'',null,null,p_obo,coalesce(p_wake_kind,''interactive''),p_agent,p_op_key);'
    || E'\n  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,''agent_create_account_set'',null,jsonb_build_object(''account_set_id'',s,''account_set_version_id'',v,''op_key'',p_op_key));'
    || E'\n  return clara._finish_op(p_firm,''agent_create_account_set'',p_op_key,jsonb_build_object(''account_set_id'',s,''account_set_version_id'',v,''revision'',next_revision));';
begin
  d := pg_get_functiondef('clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)'::regprocedure);
  v_n := (length(d) - length(replace(d, key_from, ''))) / length(key_from);
  if v_n <> 2 then raise exception 'f_a5 pr2b #3-fix: verb-key anchor occurs % time(s), expected 2', v_n using errcode='CLR10'; end if;
  d := replace(d, key_from, key_to);
  v_n := (length(d) - length(replace(d, ret_from, ''))) / length(ret_from);
  if v_n <> 1 then raise exception 'f_a5 pr2b #3-fix: return anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, ret_from, ret_to);
  perform pg_temp._fa5b_assert_no_wiki('#3-fix', d);
  execute d;
  raise notice 'f_a5 pr2b #3-fix: verb-key renamed (agent_create_account_set), audit+receipt added -- the human body wrote neither';
end
$x3_fix$;
revoke all on function clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb) from public;

-- ============================ SECTION 4 -- clara._requeue_render_job_core =======================
do $x4$
declare d text;
begin
  d := pg_temp._fa5b_derive('clara.requeue_render_job(uuid,text,boolean)',
        '_requeue_render_job_core',
        E'c := clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 'c record; ', 1, 2,
        ', p_agent jsonb default null, p_op_key text default null');
  execute d;
  raise notice 'f_a5 pr2b #4: clara._requeue_render_job_core derived and reversal-proven';
end
$x4$;

do $x4_fix$
declare d text; v_n int;
  head_from text := 'j.requested_by, null, ''requeue_render_job'', null,';
  head_to   text := 'j.requested_by, p_wake_kind, ''agent_requeue_render_job'', null,';
  args_from text := E'''reason\', v_reason, \'predecessor_last_error\', j.last_error));';
  args_to   text := E'''reason\', v_reason, \'predecessor_last_error\', j.last_error, \'requeue_directed_by\', p_obo));';
  rcpt_from text := 'perform clara._audit(p_firm, p_actor, j.requested_by,';
  rcpt_to   text := 'perform clara._report_agent_receipt(p_firm, j.client_id, j.report_run_id, null, ''requeue_render'', ''done'', null, null, p_obo, coalesce(p_wake_kind,''interactive''), p_agent, p_op_key);'
    || E'\n  perform clara._audit(p_firm, p_actor, j.requested_by,';
begin
  d := pg_get_functiondef('clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)'::regprocedure);
  v_n := (length(d) - length(replace(d, head_from, ''))) / length(head_from);
  if v_n <> 1 then raise exception 'f_a5 pr2b #4-fix: audit-head anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, head_from, head_to);
  v_n := (length(d) - length(replace(d, args_from, ''))) / length(args_from);
  if v_n <> 1 then raise exception 'f_a5 pr2b #4-fix: audit-args anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, args_from, args_to);
  v_n := (length(d) - length(replace(d, rcpt_from, ''))) / length(rcpt_from);
  if v_n <> 1 then raise exception 'f_a5 pr2b #4-fix: receipt-insertion-point anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, rcpt_from, rcpt_to);
  perform pg_temp._fa5b_assert_no_wiki('#4-fix', d);
  execute d;
  raise notice 'f_a5 pr2b #4-fix: audit verb renamed (agent_requeue_render_job), wake_kind slot filled, requeue_directed_by carries p_obo, receipt added; j.requested_by is UNTOUCHED in the obo slot (header note 2)';
end
$x4_fix$;
revoke all on function clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text) from public;

-- ============================ SECTION 5 -- FOUR TYPED-READ CORES (new; TA-P4 A / F5-OQ-13) ======
-- Not "stable" in the catalog sense -- each writes its own receipt row in the same transaction as
-- its read, matching clara.verify_report_artifact's own precedent ("a verification that leaves no
-- trace is not evidence that anyone verified", 0072:136-141). clara_agent_ro is never granted
-- anything here or anywhere in this item (survey C4/C5): these are wake-door reads, not table
-- SELECT grants.

create function clara._report_run_state_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_report_run_id uuid, p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; result jsonb;
begin
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = p_firm;
  if not found then raise exception 'report run not found in your firm' using errcode = 'CLR11'; end if;
  result := jsonb_build_object(
    'report_run_id', r.id, 'client_id', r.client_id, 'state', r.state,
    'period_start', r.period_start, 'period_end', r.period_end,
    'requested_by', r.requested_by, 'directed_by', r.directed_by, 'prepared_by_agent', r.prepared_by_agent,
    'issued_by', r.issued_by, 'issued_at', r.issued_at, 'issue_mode', r.issue_mode,
    'issued_artifact_id', r.issued_artifact_id,
    'claim', (select jsonb_build_object('claim_assessment_id', ca.id, 'status', ca.status, 'uncertified', ca.uncertified)
                from clara.report_claim_assessments ca where ca.report_run_id = r.id),
    'artifacts', coalesce((select jsonb_agg(jsonb_build_object('artifact_id', a.id, 'kind', a.kind,
        'sha256', a.sha256, 'sealed_at', a.sealed_at) order by a.sealed_at)
        from clara.report_artifacts a where a.report_run_id = r.id), '[]'::jsonb));
  perform clara._report_agent_receipt(p_firm, r.client_id, r.id, null, 'typed_read', 'done', null, null,
    p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key);
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'report_run_state', null, jsonb_build_object('report_run_id', r.id));
  return result;
end
$$;
revoke all on function clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text) from public;

create function clara._report_claim_state_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_report_run_id uuid, p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_run_id uuid; v_client_id uuid; c record; result jsonb;
begin
  select id, client_id into v_run_id, v_client_id from clara.report_runs where id = p_report_run_id and firm_id = p_firm;
  if v_run_id is null then raise exception 'report run not found in your firm' using errcode = 'CLR11'; end if;
  select * into c from clara.report_claim_assessments where report_run_id = v_run_id;
  result := case when c.id is null
    then jsonb_build_object('report_run_id', v_run_id, 'assessed', false)
    else jsonb_build_object('report_run_id', v_run_id, 'assessed', true, 'claim_assessment_id', c.id,
      'status', c.status, 'uncertified', c.uncertified, 'reason_codes', c.reason_codes, 'assessed_at', c.assessed_at)
    end;
  perform clara._report_agent_receipt(p_firm, v_client_id, v_run_id, null, 'typed_read', 'done', null, null,
    p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key);
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'report_claim_state', null, jsonb_build_object('report_run_id', v_run_id));
  return result;
end
$$;
revoke all on function clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text) from public;

create function clara._report_artifact_index_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare result jsonb;
begin
  perform 1 from clara.clients where id = p_client and firm_id = p_firm;
  if not found then raise exception 'client not found in your firm' using errcode = 'CLR11'; end if;
  -- A DOCUMENTED CAP (200 rows), not an export: the index is a typed READ for the chat toolface,
  -- never a bulk pull. The severed sandbox item owns the export path (design SS3.6).
  with ranked as (
    select a.* from clara.report_artifacts a where a.firm_id = p_firm and a.client_id = p_client
     order by a.sealed_at desc limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object('artifact_id', id, 'report_run_id', report_run_id, 'kind', kind,
      'sha256', sha256, 'byte_size', byte_size, 'claim_removed', claim_removed, 'uncertified', uncertified,
      'directed_by', directed_by, 'prepared_by_agent', prepared_by_agent, 'sealed_at', sealed_at)
      order by sealed_at desc), '[]'::jsonb) into result
    from ranked;
  result := jsonb_build_object('client_id', p_client, 'artifacts', result);
  perform clara._report_agent_receipt(p_firm, p_client, null, null, 'typed_read', 'done', null, null,
    p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key);
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'report_artifact_index', null, jsonb_build_object('client_id', p_client));
  return result;
end
$$;
revoke all on function clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text) from public;

-- NO CLIENT PARAMETER -- header note (3, of pr2c_wrappers1.sql's/pr2d_wrappers2.sql's shared
-- banner): metric_definitions/metric_definition_versions carry no client_id column at all on the
-- live catalog (rig-measured), so this reader is FIRM-scoped (global/canonical rows included), the
-- same population evaluate_fs_pack_agent_v1 itself resolves.
create function clara._metric_definition_index_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare result jsonb;
begin
  with ranked as (
    select d.definition_key, d.title, v.id as definition_version_id, v.revision, v.state,
      v.unit_key, v.applies_from, v.applies_to, v.firm_id
      from clara.metric_definition_versions v
      join clara.metric_definitions d on d.id = v.definition_id
     where v.firm_id is null or v.firm_id = p_firm
     order by d.definition_key, v.revision desc
     limit 500
  )
  select coalesce(jsonb_agg(jsonb_build_object('definition_key', definition_key, 'title', title,
      'definition_version_id', definition_version_id, 'revision', revision, 'state', state,
      'unit_key', unit_key, 'applies_from', applies_from, 'applies_to', applies_to,
      'scope', case when firm_id is null then 'global' else 'firm' end)
      order by definition_key, revision desc), '[]'::jsonb) into result
    from ranked;
  perform clara._report_agent_receipt(p_firm, null, null, null, 'typed_read', 'done', null, null,
    p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key);
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'metric_definition_index', null, '{}'::jsonb);
  return result;
end
$$;
revoke all on function clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text) from public;

reset role;

-- ============================ TAIL ===============================================================
do $tail$
declare v_sig text; v_role text;
  v_cores text[] := array[
    'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)',
    'clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)',
    'clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text)'];
begin
  if current_user <> (select v from _fa5pr2b_pre where k = 'deploy_user')
     or current_role <> (select v from _fa5pr2b_pre where k = 'deploy_role') then
    raise exception 'f_a5 pr2b tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  foreach v_sig in array v_cores loop
    if not exists (select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(f.proowner) = 'clara_fn_owner') then
      raise exception 'f_a5 pr2b tail: core posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive',
        'clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'f_a5 pr2b tail: % executes the ungranted core %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  raise notice 'f_a5 pr2b tail: OK -- 6 cores minted, definer/search_path-pinned/owner clara_fn_owner, reachable by NO application role (both non-inheriting logins incl.)';
end
$tail$;
