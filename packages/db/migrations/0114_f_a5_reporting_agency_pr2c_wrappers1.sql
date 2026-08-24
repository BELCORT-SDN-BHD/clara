-- UNNUMBERED_f_a5_reporting_agency_pr2c_wrappers1.sql -- Wave F Track-A item F-A5, PR-2, file 3 of
-- 5: the CHAIN + DEFINITIONS wake wrappers (9 of the 17 annex A.1 enumerates -- open, evaluate,
-- seal dataset, assess claim, seal artifact, requeue, approve/supersede/reject metric definition).
-- Applies ONLY after pr2a_defcores.sql and pr2b_othercores.sql, whose cores every wrapper below
-- delegates to. Ungranted still -- EXECUTE and the allowlist rows land in pr2e_grants.sql, the
-- last file, so between this file and that one every wrapper below is DEAD CODE reachable by no
-- application role (the same fail-safe shape 0077/0078 established: "the absence of part 2 is the
-- absence of the feature, never a half-open door").
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1; annex
-- reporting-agency-annexes-1-mechanics.md A.1 (verb enumeration, header note (1) below).
--
-- ============================ ONE MEASURED DIVERGENCE, FLAGGED FOR REVIEW (law 1) ================
-- SIX of PR-1's D1 cores -- _open_report_run_core, _assess_report_claim_core,
-- _seal_report_dataset_core (this file), plus _publish_report_template_core /
-- _publish_chart_template_core (pr2d_wrappers2.sql) and _enqueue_render_job_core (no wrapper at
-- all) -- carry NO p_agent parameter and call clara._report_agent_receipt NOWHERE (rig-measured:
-- only _seal_report_artifact_core and evaluate_fs_pack_agent_v1 got that plumbing in PR-1). Annex
-- A.3's closed act world still names open_run / assess_claim / seal_dataset as receipted acts, and
-- design SS3.4 says "the core writes both". PR-1's file is authored, pushed and under its own
-- review; this file does not edit it. Instead the WRAPPER for each of those verbs calls
-- clara._report_agent_receipt itself, immediately after the core returns, inside the SAME function
-- invocation -- one transaction, so a receipt-insert failure rolls the core's own writes back with
-- it. Every one of those cores stays ungranted and reachable by no application role other than
-- through its wrapper (pr2e_grants.sql's tail re-proves it), so "no receipt, no act" holds in
-- practice even though the receipt is not written BY THE CORE for these five. Not DML text in the
-- wrapper body -- a function call, same shape as assert_wake_allowed -- but a real divergence from
-- "the core writes both" and flagged as such.
--
-- ============================ SECTION 0 -- PRESTATE ==============================================
do $s0$
declare v_missing text[] := '{}'; v_present text[] := '{}'; v_sig text;
begin
  foreach v_sig in array array[
      'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()',
      'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)',
      'clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text)',
      'clara._assess_report_claim_core(uuid,uuid,uuid,text,uuid,text)',
      'clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text)',
      'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)',
      'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)',
      'clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text)',
      'clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)',
      'clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)',
      'clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2c prestate: prerequisite object(s) absent -- apply pr2a/pr2b/PR-1 first: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;

  foreach v_sig in array array[
      'clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text)',
      'clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text)',
      'clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb)',
      'clara.wake_assess_report_claim(uuid,text,text,jsonb)',
      'clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text)',
      'clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text)',
      'clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text)',
      'clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text)',
      'clara.wake_reject_metric_definition(uuid,text,text,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'f_a5 pr2c prestate: partial birth -- wrapper(s) already present: %', array_to_string(v_present,' | ') using errcode='CLR10';
  end if;

  raise notice 'f_a5 pr2c prestate: clean -- 12 prerequisite objects present, 9 wrappers absent';
end
$s0$;

create temporary table _fa5pr2c_pre (k text primary key, v text);
insert into _fa5pr2c_pre values ('deploy_user', current_user), ('deploy_role', current_role);
set role clara_fn_owner;

-- ============================ THE NINE WRAPPERS ==================================================
-- SECURITY DEFINER, search_path pinned, resolves clara.wake_context() then
-- clara.assert_wake_allowed(kind, name), refuses a blank op_key / blank rationale / incomplete
-- model BEFORE any work, carries no DML text of its own (a receipt-write is a function call, not
-- DML text -- header note above), delegates to its ungranted core. Grants + allowlist land in
-- pr2e_grants.sql.

-- --- chain: open -------------------------------------------------------------------------------
create function clara.wake_open_report_run(
    p_client uuid, p_report_spec_version_id uuid, p_books_snapshot_id uuid, p_reporting_period_id uuid,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_result jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_open_report_run');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  v_result := clara._open_report_run_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_client, p_report_spec_version_id, p_books_snapshot_id, p_reporting_period_id, p_op_key);
  -- header note above: _open_report_run_core carries no p_agent and writes no receipt itself.
  perform clara._report_agent_receipt(w.firm_id, p_client, (v_result->>'report_run_id')::uuid, null,
    'open_run', 'done', null, null, w.on_behalf_of, w.wake_kind, p_agent, p_op_key);
  return v_result;
end
$$;

-- --- chain: evaluate -----------------------------------------------------------------------------
create function clara.wake_evaluate_report_pack(
    p_report_run_id uuid, p_definition_version_ids uuid[], p_period_ids uuid[], p_snapshot_id uuid,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_client uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_evaluate_report_pack');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  -- the core takes p_client explicitly (evaluate_fs_pack_agent_v1's own signature); a read, not DML.
  select client_id into v_client from clara.report_runs where id = p_report_run_id and firm_id = w.firm_id;
  if v_client is null then raise exception 'report run not found in your firm' using errcode = 'CLR11'; end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara.evaluate_fs_pack_agent_v1(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    v_client, p_definition_version_ids, p_period_ids, p_snapshot_id, p_report_run_id, p_agent, p_op_key);
end
$$;

-- --- chain: seal dataset -------------------------------------------------------------------------
create function clara.wake_seal_report_dataset(
    p_report_run_id uuid, p_chart_template_version_ids uuid[], p_op_key text, p_rationale text, p_model jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_result jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_seal_report_dataset');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  v_result := clara._seal_report_dataset_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_report_run_id, p_chart_template_version_ids, p_op_key);
  perform clara._report_agent_receipt(w.firm_id, null, p_report_run_id, null, 'seal_dataset', 'done', null, null,
    w.on_behalf_of, w.wake_kind, p_agent, p_op_key);
  return v_result;
end
$$;

-- --- chain: assess claim -------------------------------------------------------------------------
create function clara.wake_assess_report_claim(p_report_run_id uuid, p_op_key text, p_rationale text, p_model jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb; v_result jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_assess_report_claim');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  v_result := clara._assess_report_claim_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_report_run_id, p_op_key);
  perform clara._report_agent_receipt(w.firm_id, null, p_report_run_id, null, 'assess_claim', 'done', null, null,
    w.on_behalf_of, w.wake_kind, p_agent, p_op_key);
  return v_result;
end
$$;

-- --- chain: seal artifact (core already carries p_agent + receipt -- PR-1's own D1 #6) -----------
create function clara.wake_seal_report_artifact(
    p_report_run_id uuid, p_kind text, p_key_extension text, p_sha256 text, p_byte_size bigint,
    p_manifest jsonb, p_prior_artifact_id uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_seal_report_artifact');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._seal_report_artifact_core(w.firm_id, clara.agent_user_id(), p_report_run_id, p_kind,
    p_key_extension, p_sha256, p_byte_size, p_manifest, p_prior_artifact_id, p_op_key,
    w.on_behalf_of, w.wake_kind, p_agent);
end
$$;

-- --- chain: requeue render job (core already carries p_agent + receipt -- pr2b's own) -------------
create function clara.wake_requeue_render_job(
    p_job uuid, p_reason text, p_accept_drift boolean, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_requeue_render_job');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._requeue_render_job_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_job, p_reason, coalesce(p_accept_drift, false), p_agent, p_op_key);
end
$$;

-- --- definitions: approve (core already carries p_agent + receipt -- PR-1's own) ------------------
create function clara.wake_approve_metric_definition(
    p_definition_version_id uuid, p_expected_formula_sha256 bytea, p_reason text,
    p_self_approval_attestation text, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_approve_metric_definition');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._agent_approve_metric_definition_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_definition_version_id, p_expected_formula_sha256, p_reason, p_self_approval_attestation, p_agent, p_op_key);
end
$$;

-- --- definitions: supersede (core built in pr2a, carries receipt) --------------------------
create function clara.wake_supersede_metric_definition(
    p_definition_version_id uuid, p_successor_version_id uuid, p_reason text,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_supersede_metric_definition');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._agent_supersede_metric_definition_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_definition_version_id, p_successor_version_id, p_reason, p_op_key, p_agent);
end
$$;

-- --- definitions: reject (core built in pr2a, carries receipt) -----------------------------
create function clara.wake_reject_metric_definition(
    p_definition_version_id uuid, p_reason text, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; p_agent jsonb;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_reject_metric_definition');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake report act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'model','')),'') is null or nullif(btrim(coalesce(p_model->>'model_version','')),'') is null then
    raise exception 'a wake report act names its model' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  p_agent := jsonb_build_object('model', p_model->>'model', 'model_version', p_model->>'model_version',
    'rationale', p_rationale, 'wake_credential_id', w.credential_id);
  return clara._agent_reject_metric_definition_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_definition_version_id, p_reason, p_op_key, p_agent);
end
$$;

reset role;

-- ============================ TAIL (structural only -- grants/census in pr2e) ===================
do $tail$
declare v_sig text;
  v_wrappers text[] := array[
    'clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text)',
    'clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text)',
    'clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb)',
    'clara.wake_assess_report_claim(uuid,text,text,jsonb)',
    'clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text)',
    'clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text)',
    'clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text)',
    'clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text)',
    'clara.wake_reject_metric_definition(uuid,text,text,jsonb,text)'];
begin
  if current_user <> (select v from _fa5pr2c_pre where k = 'deploy_user')
     or current_role <> (select v from _fa5pr2c_pre where k = 'deploy_role') then
    raise exception 'f_a5 pr2c tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  foreach v_sig in array v_wrappers loop
    if not exists (select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(f.proowner) = 'clara_fn_owner') then
      raise exception 'f_a5 pr2c tail: wrapper posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  raise notice 'f_a5 pr2c tail: OK -- 9 wrappers minted (definer, search_path-pinned, owner clara_fn_owner); still UNGRANTED (fail-safe until pr2e_grants.sql runs)';
end
$tail$;
