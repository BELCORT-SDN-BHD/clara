-- UNNUMBERED_f_a5_reporting_agency_pr2e_grants.sql -- Wave F Track-A item F-A5, PR-2, file 5 of 5:
-- THE GRANTED SURFACE. EXECUTE to clara_wake_interactive on all seventeen wrappers (minted in
-- pr2c_wrappers1.sql + pr2d_wrappers2.sql), the wake_fn_allowlist rows, and the tail census that
-- proves the roster in BOTH directions (C.2). Applies ONLY after pr2a_defcores.sql,
-- pr2b_othercores.sql, pr2c_wrappers1.sql and pr2d_wrappers2.sql.
--
-- THE RESIDUE, NAMED RATHER THAN GLOSSED (0078's own idiom). Between pr2d's apply and this file's,
-- all seventeen wrappers exist but are reachable by no application role at all -- a database that
-- stops between them has strictly LESS surface than one that never applied any of PR-2, never a
-- half-open door.
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1, SS5 PR-2; annexes
-- reporting-agency-annexes-1-mechanics.md (A.1, C.1-C.5 censuses) and
-- reporting-agency-annexes-2-record.md (D, E).
--
-- ============================ SECTION 0 -- PRESTATE ==============================================
do $s0$
declare v_missing text[] := '{}'; v_sig text;
begin
  foreach v_sig in array array[
      'clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text)',
      'clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text)',
      'clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb)',
      'clara.wake_assess_report_claim(uuid,text,text,jsonb)',
      'clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text)',
      'clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text)',
      'clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text)',
      'clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text)',
      'clara.wake_reject_metric_definition(uuid,text,text,jsonb,text)',
      'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)',
      'clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text)',
      'clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text)',
      'clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text)',
      'clara.wake_report_run_state(uuid,text,jsonb,text)',
      'clara.wake_report_claim_state(uuid,text,jsonb,text)',
      'clara.wake_report_artifact_index(uuid,text,jsonb,text)',
      'clara.wake_metric_definition_index(text,jsonb,text)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr2e prestate: wrapper(s) absent -- apply pr2c_wrappers1.sql and pr2d_wrappers2.sql first: %', array_to_string(v_missing,' | ') using errcode='CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name in (
      'wake_open_report_run','wake_evaluate_report_pack','wake_seal_report_dataset',
      'wake_assess_report_claim','wake_seal_report_artifact','wake_requeue_render_job',
      'wake_approve_metric_definition','wake_supersede_metric_definition','wake_reject_metric_definition',
      'wake_create_account_set','wake_mint_metric_input_snapshot',
      'wake_publish_chart_template_version','wake_publish_report_template_version',
      'wake_report_run_state','wake_report_claim_state','wake_report_artifact_index','wake_metric_definition_index')) then
    raise exception 'f_a5 pr2e prestate: an F-A5 PR-2 allowlist row already exists' using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr2e prestate: clean -- all 17 wrappers present, allowlist clean';
end
$s0$;

create temporary table _fa5pr2e_pre (k text primary key, v text);
insert into _fa5pr2e_pre values ('deploy_user', current_user), ('deploy_role', current_role);
-- C1's baseline, captured BEFORE any grant below (and before SET ROLE, so this role still owns
-- the temp table it just created) -- this file touches no DML-writing body, so the count must be
-- identical before and after (the tail re-measures and compares).
insert into _fa5pr2e_pre
  select 'writers', (
    select count(*)::text from pg_proc f
      cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
      join pg_roles g on g.rolname = app.rolname
     where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
       and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M'
  );
set role clara_fn_owner;

-- ============================ SECTION 1 -- GRANTS + ALLOWLIST ====================================
revoke all on function
  clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text),
  clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text),
  clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb),
  clara.wake_assess_report_claim(uuid,text,text,jsonb),
  clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text),
  clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text),
  clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text),
  clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text),
  clara.wake_reject_metric_definition(uuid,text,text,jsonb,text),
  clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text),
  clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text),
  clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text),
  clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text),
  clara.wake_report_run_state(uuid,text,jsonb,text),
  clara.wake_report_claim_state(uuid,text,jsonb,text),
  clara.wake_report_artifact_index(uuid,text,jsonb,text),
  clara.wake_metric_definition_index(text,jsonb,text)
  from public;

grant execute on function
  clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text),
  clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text),
  clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb),
  clara.wake_assess_report_claim(uuid,text,text,jsonb),
  clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text),
  clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text),
  clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text),
  clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text),
  clara.wake_reject_metric_definition(uuid,text,text,jsonb,text),
  clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text),
  clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text),
  clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text),
  clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text),
  clara.wake_report_run_state(uuid,text,jsonb,text),
  clara.wake_report_claim_state(uuid,text,jsonb,text),
  clara.wake_report_artifact_index(uuid,text,jsonb,text),
  clara.wake_metric_definition_index(text,jsonb,text)
  to clara_wake_interactive;

insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('interactive', 'wake_open_report_run'),
  ('interactive', 'wake_evaluate_report_pack'),
  ('interactive', 'wake_seal_report_dataset'),
  ('interactive', 'wake_assess_report_claim'),
  ('interactive', 'wake_seal_report_artifact'),
  ('interactive', 'wake_requeue_render_job'),
  ('interactive', 'wake_approve_metric_definition'),
  ('interactive', 'wake_supersede_metric_definition'),
  ('interactive', 'wake_reject_metric_definition'),
  ('interactive', 'wake_create_account_set'),
  ('interactive', 'wake_mint_metric_input_snapshot'),
  ('interactive', 'wake_publish_chart_template_version'),
  ('interactive', 'wake_publish_report_template_version'),
  ('interactive', 'wake_report_run_state'),
  ('interactive', 'wake_report_claim_state'),
  ('interactive', 'wake_report_artifact_index'),
  ('interactive', 'wake_metric_definition_index')
on conflict do nothing;

reset role;

-- ============================ SECTION 2 -- TAIL CENSUS (C.1, C.2) ===============================
do $tail$
declare
  v_role text; n int; v_sig text; v_grantees text[]; v_writers int;
  v_wrappers text[] := array[
    'clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text)',
    'clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text)',
    'clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb)',
    'clara.wake_assess_report_claim(uuid,text,text,jsonb)',
    'clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text)',
    'clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text)',
    'clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text)',
    'clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text)',
    'clara.wake_reject_metric_definition(uuid,text,text,jsonb,text)',
    'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)',
    'clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text)',
    'clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text)',
    'clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text)',
    'clara.wake_report_run_state(uuid,text,jsonb,text)',
    'clara.wake_report_claim_state(uuid,text,jsonb,text)',
    'clara.wake_report_artifact_index(uuid,text,jsonb,text)',
    'clara.wake_metric_definition_index(text,jsonb,text)'];
  v_cores text[] := array[
    'clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text)',
    'clara._assess_report_claim_core(uuid,uuid,uuid,text,uuid,text)',
    'clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text)',
    'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)',
    'clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)',
    'clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text)',
    'clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)',
    'clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)',
    'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)',
    'clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)',
    'clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text)',
    'clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text)',
    'clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text)',
    'clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text)',
    -- design SS3.1 A.1: _enqueue_render_job_core gets NO wrapper; re-proved ungranted here too.
    'clara._enqueue_render_job_core(uuid,uuid,uuid,text,uuid,text)',
    'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)'];
begin
  if current_user <> (select v from _fa5pr2e_pre where k = 'deploy_user')
     or current_role <> (select v from _fa5pr2e_pre where k = 'deploy_role') then
    raise exception 'f_a5 pr2e tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;

  -- C.2, direction 1: every wrapper NAMED in this item is a definer, search_path-pinned, owned by
  -- clara_fn_owner, and its EXACT EXECUTE grantee set is {clara_wake_interactive} -- aclexplode
  -- reads what the catalog actually holds (PUBLIC included), never a hand-sampled role list.
  foreach v_sig in array v_wrappers loop
    if not exists (select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(f.proowner) = 'clara_fn_owner') then
      raise exception 'f_a5 pr2e tail: wrapper posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
    select coalesce(array_agg(g order by g), '{}') into v_grantees from (
      select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
        from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
       where f.oid = v_sig::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee <> f.proowner) q;
    if v_grantees is distinct from array['clara_wake_interactive'] then
      raise exception 'f_a5 pr2e tail: % EXECUTE grantees are %, expected exactly {clara_wake_interactive}',
        v_sig, v_grantees using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'f_a5 pr2e tail: % executes %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- every core -- PR-1's, this item's, and the wrapper-less enqueue core -- stays reachable by NO
  -- application role, including both non-inheriting login shells (0077's method).
  foreach v_sig in array v_cores loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive',
        'clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'f_a5 pr2e tail: % executes the ungranted core %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- C.2, direction 2: the allowlist holds EXACTLY these seventeen rows, all 'interactive', and no
  -- other reporting-family row exists (an omission and an extra are both roster failures).
  select count(*) into n from clara.wake_fn_allowlist where function_name = any(
    select regexp_replace(regexp_replace(x, '^clara\.', ''), '\(.*', '') from unnest(v_wrappers) x);
  if n <> 17 then
    raise exception 'f_a5 pr2e tail: allowlist holds % of the 17 named wrapper rows', n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name = any(
      select regexp_replace(regexp_replace(x, '^clara\.', ''), '\(.*', '') from unnest(v_wrappers) x) and wake_kind <> 'interactive') then
    raise exception 'f_a5 pr2e tail: a wrapper row carries a kind other than interactive' using errcode = 'CLR10';
  end if;
  -- no allowlist row exists for the one extraction that gets no wrapper (a superset failure).
  if exists (select 1 from clara.wake_fn_allowlist where function_name = 'wake_enqueue_render_job') then
    raise exception 'f_a5 pr2e tail: an allowlist row exists for wake_enqueue_render_job, which A.1 never names' using errcode = 'CLR10';
  end if;

  -- C1: the delta definition-writer census stays UNMOVED by this file -- it touches no DML-writing
  -- body, only wrapper functions (no DML text) and prior grants. Compared against THIS file's own
  -- prestate baseline, captured before any grant above.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_writers::text <> (select v from _fa5pr2e_pre where k = 'writers') then
    raise exception 'f_a5 pr2e tail: app-executable definition writers moved from % to %',
      (select v from _fa5pr2e_pre where k = 'writers'), v_writers using errcode = 'CLR10';
  end if;

  raise notice 'f_a5 pr2e tail: OK -- 17 wrappers definer/search_path-pinned/owner clara_fn_owner, EXECUTE granted to clara_wake_interactive ONLY (no PUBLIC, no other named role, both non-inheriting logins spared); every core (PR-1''s + PR-2''s 9 + the wrapper-less enqueue core) reachable by NO application role; allowlist holds exactly these 17 names, interactive-only, no superset row; delta definition-writer census unmoved at %', v_writers;
end
$tail$;
