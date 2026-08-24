-- UNNUMBERED_f_a5_reporting_agency_pr2d_wrappers2.sql -- Wave F Track-A item F-A5, PR-2, file 4 of
-- 5: the CATALOG + TEMPLATES + READS wake wrappers (the remaining 8 of the 17 annex A.1
-- enumerates -- create account set, mint metric input snapshot, publish chart/report template
-- version, and the four typed readers). Applies ONLY after pr2a_defcores.sql and
-- pr2b_othercores.sql. Ungranted still -- EXECUTE and the allowlist rows land in
-- pr2e_grants.sql, the last file (0077/0078's fail-safe shape: "the absence of part 2 is the
-- absence of the feature, never a half-open door").
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1; annex
-- reporting-agency-annexes-1-mechanics.md A.1.
--
-- ============================ TWO MEASURED DIVERGENCES, FLAGGED FOR REVIEW (law 1) ===============
--
-- (1) _publish_report_template_core / _publish_chart_template_core carry no p_agent and write no
--     receipt (PR-1's own build; the same shape pr2c_wrappers1.sql's header explains for its own
--     three gap cores). Their wrappers below call clara._report_agent_receipt themselves,
--     immediately after the core returns, inside the same function invocation/transaction.
--
-- (2) clara.wake_metric_definition_index carries NO client parameter, though annex A.1 writes
--     "wake_metric_definition_index(client)". Measured on the live catalog:
--     clara.metric_definitions and clara.metric_definition_versions carry NO client_id column at
--     all -- definitions are firm-scoped (or global, firm_id null), never client-scoped. A
--     "client" parameter here would be either ignored (dishonest) or a permanent no-op filter. The
--     reader is scoped to the caller's firm (plus canonical/global rows), matching how
--     evaluate_fs_pack_agent_v1 itself resolves a definition (firm_id is null or firm_id=p_firm).
--
-- ============================ SECTION 0 -- PRESTATE ==============================================
do $s0$
declare v_missing text[] := '{}'; v_present text[] := '{}'; v_sig text;
begin
  foreach v_sig in array array[
      'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()',
      'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)',
      'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)',
      'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)',
      'clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text)',
      'clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text)',
      'clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
      'clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2d prestate: prerequisite object(s) absent -- apply pr2a/pr2b/PR-1 first: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;

  foreach v_sig in array array[
      'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)',
      'clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text)',
      'clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text)',
      'clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text)',
      'clara.wake_report_run_state(uuid,text,jsonb,text)',
      'clara.wake_report_claim_state(uuid,text,jsonb,text)',
      'clara.wake_report_artifact_index(uuid,text,jsonb,text)',
      'clara.wake_metric_definition_index(text,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'f_a5 pr2d prestate: partial birth -- wrapper(s) already present: %', array_to_string(v_present,' | ') using errcode='CLR10';
  end if;

  raise notice 'f_a5 pr2d prestate: clean -- 10 prerequisite objects present, 8 wrappers absent';
end
$s0$;

create temporary table _fa5pr2d_pre (k text primary key, v text);
insert into _fa5pr2d_pre values ('deploy_user', current_user), ('deploy_role', current_role);
set role clara_fn_owner;

-- ============================ THE EIGHT WRAPPERS =================================================

-- --- catalog: create account set (core built in pr2b, carries receipt) ---------------------------
-- p_client is not named in annex A.1's shorthand row but is the human verb's own first, required
-- parameter (account sets are client-scoped, clara.account_sets.client_id not null) -- carried
-- through explicitly rather than silently dropped.
create function clara.wake_create_account_set(
    p_client uuid, p_set_key text, p_title text, p_selector jsonb, p_zero_when_no_rows boolean,
    p_effective_from date, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_create_account_set');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._agent_create_account_set_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_client, p_set_key, p_title, p_selector, p_zero_when_no_rows, p_effective_from, p_op_key, p_agent);
end
$$;

-- --- catalog: mint metric input snapshot (core built in pr2a, carries receipt) -------------
create function clara.wake_mint_metric_input_snapshot(
    p_client uuid, p_period_ids uuid[], p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_mint_metric_input_snapshot');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._agent_mint_metric_input_snapshot_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_client, p_period_ids, p_op_key, p_agent);
end
$$;

-- --- templates: publish chart template version (gap core; header note 1) -------------------------
create function clara.wake_publish_chart_template_version(
    p_chart_key text, p_title text, p_chart_spec_ast jsonb, p_effective_from date,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_result jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_publish_chart_template_version');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  v_result := clara._publish_chart_template_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_chart_key, p_title, p_chart_spec_ast, p_effective_from, p_op_key);
  perform clara._report_agent_receipt(w.firm_id, null, null, null, 'publish_chart_template', 'done', null, null,
    w.on_behalf_of, w.wake_kind, p_agent, p_op_key);
  return v_result;
end
$$;

-- --- templates: publish report template version (gap core; header note 1; refuses statutory) -----
create function clara.wake_publish_report_template_version(
    p_template_key text, p_title text, p_report_class text, p_claim_capability text,
    p_statutory_profile_version_id uuid, p_house_style_version_id uuid, p_layout_ast jsonb,
    p_effective_from date, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_result jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_publish_report_template_version');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  -- statutory_template_human (0069:121's floor branch, unchanged in the CoR'd core): the core itself
  -- refuses report_class='statutory' -- restated here only in the comment, never re-implemented.
  v_result := clara._publish_report_template_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_template_key, p_title, p_report_class, p_claim_capability, p_statutory_profile_version_id,
    p_house_style_version_id, p_layout_ast, p_effective_from, p_op_key);
  perform clara._report_agent_receipt(w.firm_id, null, null, null, 'publish_report_template', 'done', null, null,
    w.on_behalf_of, w.wake_kind, p_agent, p_op_key);
  return v_result;
end
$$;

-- --- reads: four typed readers, each op_key/rationale/model-checked, each firm-scoped -------------
create function clara.wake_report_run_state(p_report_run_id uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_report_run_state');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._report_run_state_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_report_run_id, p_agent, p_op_key);
end
$$;

create function clara.wake_report_claim_state(p_report_run_id uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_report_claim_state');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._report_claim_state_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_report_run_id, p_agent, p_op_key);
end
$$;

create function clara.wake_report_artifact_index(p_client uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_report_artifact_index');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._report_artifact_index_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_client, p_agent, p_op_key);
end
$$;

create function clara.wake_metric_definition_index(p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_metric_definition_index');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._metric_definition_index_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_agent, p_op_key);
end
$$;

reset role;

-- ============================ TAIL (structural only -- grants/census in pr2e) ===================
do $tail$
declare v_sig text;
  v_wrappers text[] := array[
    'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)',
    'clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text)',
    'clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text)',
    'clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text)',
    'clara.wake_report_run_state(uuid,text,jsonb,text)',
    'clara.wake_report_claim_state(uuid,text,jsonb,text)',
    'clara.wake_report_artifact_index(uuid,text,jsonb,text)',
    'clara.wake_metric_definition_index(text,jsonb,text)'];
begin
  if current_user <> (select v from _fa5pr2d_pre where k = 'deploy_user')
     or current_role <> (select v from _fa5pr2d_pre where k = 'deploy_role') then
    raise exception 'f_a5 pr2d tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  foreach v_sig in array v_wrappers loop
    if not exists (select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(f.proowner) = 'clara_fn_owner') then
      raise exception 'f_a5 pr2d tail: wrapper posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  raise notice 'f_a5 pr2d tail: OK -- 8 wrappers minted (definer, search_path-pinned, owner clara_fn_owner); still UNGRANTED (fail-safe until pr2e_grants.sql runs); 17/17 wrappers now exist across pr2c+pr2d';
end
$tail$;
