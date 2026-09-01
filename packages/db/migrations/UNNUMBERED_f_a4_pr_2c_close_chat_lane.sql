-- =================================================================================================
-- F-A4 PR-2c · CLOSE-PREP CHAT LANE (FS-7 echelon 1.5, 裁-99/裁-100) — PR A, DB ONLY.
-- Design: docs/plan/active/fa4-pr2c-close-chat-design.md, especially §1-§4 and both
-- 2026-09-01 owner corrections.
--
-- WHAT LANDS HERE
--   §0  fail-closed prestate, including the apply-time zero-live-callers tripwire
--   §A  _assert_wake_task_congruent + mint_chat_close_credential
--   §B  _assert_attended_close_floor + the A8 CoR of _close_wake_ctx
--   §C  twelve extend-only interactive_client allowlist rows + the one runtime grant
--   §TAIL exact ACL, allowlist, reserved-door, source-state and byte-non-drift censuses
--
-- §DEPLOY-SHAPE — CHECKED, NEVER ASSUMED. As measured at authoring, closePrep_v1 exists and is
-- registered, but _close_wake_ctx has zero live callers because wake_engine_sources.close_prep is
-- enabled=false: PROGRESS.md:119; packages/runtime/workflows/registry.ts:121-128;
-- packages/runtime/plugins/startWorld.ts:246-256. That flag is ceremony state, not eternal fact:
-- clara.set_wake_source_enabled can flip it. §0 therefore re-reads the live row at EVERY apply and
-- raises CLR10 if it is already enabled. On that later frontier this CoR needs a D1 write-quiesce
-- window and an owner ruling; a bare apply is refused.
--
-- D1 TODAY: NONE, conditional on §0's checked disabled-source premise. _close_wake_ctx is STABLE and
-- writes nothing. mint_wake_credential_for_task, wake_context and all twelve wrappers stay byte-
-- identical; their live prosrc SHA-256 values are captured before the work and compared at §TAIL.
-- =================================================================================================

set local statement_timeout = '20min'; -- PRECAUTIONARY: no heavy pass.
set local lock_timeout = '15s';        -- fail fast if the function catalog is contended.

-- =================================================================================================
-- §0 · PRESTATE — CONTRACT-BLIND live-catalog measurements.
-- =================================================================================================
create temporary table _fa4_pr2c_pre (k text primary key, v text) on commit drop;

do $pre$
declare v_def text; v_src text; v_sig text; v_n int;
begin
  insert into _fa4_pr2c_pre(k, v) values
    ('session_user', current_user), ('current_role', current_role);

  -- 0.1 · DATED-TRIPWIRE. The A8 CoR was authored under zero live callers. Re-read the ceremony
  -- state at every apply; never pin a dated enabled=false observation as eternal.
  if not exists (select 1 from clara.wake_engine_sources where source_key='close_prep') then
    raise exception 'F-A4 PR-2c prestate: clara.wake_engine_sources.close_prep is absent'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_engine_sources
              where source_key = 'close_prep' and enabled = true) then
    raise exception 'F-A4 PR-2c prestate: clara.wake_engine_sources.close_prep is ENABLED -- the G1 rollout ceremony has already flipped it. This migration''s A8 CoR to _close_wake_ctx was authored on a zero-live-callers premise that no longer holds. Applying now needs a D1 write-quiesce window, not a bare apply -- STOP, do not apply outside one, and get an owner ruling before proceeding.'
      using errcode = 'CLR10';
  end if;

  -- 0.2 · The carrier constraints admit exactly the chat shape this PR uses.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid='clara.wake_credentials'::regclass
      and c.conname='ck_wake_credentials_kind_0011';
  if v_def is null or position('interactive_client' in v_def)=0 then
    raise exception 'F-A4 PR-2c prestate: wake_credentials kind CHECK does not admit interactive_client'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid='clara.wake_credentials'::regclass
      and c.conname='ck_wake_credentials_client_0011';
  if v_def is null or position('interactive_client' in v_def)=0 then
    raise exception 'F-A4 PR-2c prestate: wake_credentials client CHECK does not pin interactive_client'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid='clara.agent_tasks'::regclass and c.conname='ck_agent_tasks_kind_0011';
  if v_def is null or position('chat_turn' in v_def)=0 or position('close_prep' in v_def)=0 then
    raise exception 'F-A4 PR-2c prestate: agent_tasks kind CHECK lacks chat_turn or close_prep'
      using errcode='CLR10';
  end if;

  -- 0.3 · Exact prerequisites and clean CREATE-only names.
  foreach v_sig in array array[
    'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)',
    'clara.wake_context()', 'clara._close_wake_ctx(text,text,uuid,text)',
    'clara._has_capability(uuid,uuid,text)', 'clara.role_rank(text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A4 PR-2c prestate: prerequisite % does not resolve', v_sig using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array[
    'clara._assert_wake_task_congruent(uuid,uuid,uuid,text)',
    'clara._assert_attended_close_floor(text,uuid,uuid)',
    'clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)'] loop
    if to_regprocedure(v_sig) is not null then
      raise exception 'F-A4 PR-2c prestate: target % already exists', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 0.4 · Pin the exact old Tier-A order and prove A8 is not already present.
  select p.prosrc into v_src from pg_proc p
    where p.oid='clara._close_wake_ctx(text,text,uuid,text)'::regprocedure;
  if position('perform clara.assert_wake_allowed(w.wake_kind, p_verb);' in v_src)=0
     or position('v_client := clara._close_subject_client' in v_src)=0
     or position('perform clara.assert_wake_allowed(w.wake_kind, p_verb);' in v_src)
        > position('v_client := clara._close_subject_client' in v_src)
     or position('_assert_attended_close_floor' in v_src)<>0 then
    raise exception 'F-A4 PR-2c prestate: _close_wake_ctx is not the reviewed pre-A8 body/order'
      using errcode='CLR10';
  end if;

  -- 0.5 · All promised-untouched bodies, captured from pg_proc.prosrc, never migration text.
  insert into _fa4_pr2c_pre(k,v)
    select 'prosrc_sha:'||s,
      encode(sha256(convert_to((select p.prosrc from pg_proc p where p.oid=s::regprocedure),'UTF8')),'hex')
    from unnest(array[
      'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)',
      'clara.wake_context()',
      'clara.wake_list_fiscal_years(uuid,text,jsonb,text)',
      'clara.wake_get_close_plan(uuid,text,jsonb,text)',
      'clara.wake_get_close_readiness(uuid,uuid,text,jsonb,text)',
      'clara.wake_verify_close(uuid,text,jsonb,text)',
      'clara.wake_snapshot_state(uuid,text,jsonb,text)',
      'clara.wake_dry_run_close_readiness(uuid,uuid,text,jsonb,text)',
      'clara.wake_open_fiscal_year(uuid,text,date,text,jsonb,text)',
      'clara.wake_begin_close(uuid,text,jsonb,text)',
      'clara.wake_abandon_close(uuid,text,text,jsonb,text)',
      'clara.wake_propose_close(uuid,jsonb,text,text,jsonb,text)',
      'clara.wake_run_depreciation_catchup(uuid,date,text,jsonb,text)',
      'clara.wake_mint_month_snapshot(uuid,date,text,jsonb,text)']::text[]) s;

  -- 0.6 · None of the twelve interactive_client rows exists yet; capture every other row so the
  -- tail proves extend-only by a real before/after difference.
  select count(*)::int into v_n from clara.wake_fn_allowlist
    where wake_kind='interactive_client' and function_name=any(array[
      'wake_list_fiscal_years','wake_get_close_plan','wake_get_close_readiness','wake_verify_close',
      'wake_snapshot_state','wake_dry_run_close_readiness','wake_open_fiscal_year','wake_begin_close',
      'wake_abandon_close','wake_propose_close','wake_run_depreciation_catchup','wake_mint_month_snapshot']);
  if v_n<>0 then
    raise exception 'F-A4 PR-2c prestate: % close-wrapper interactive_client row(s) already exist', v_n
      using errcode='CLR10';
  end if;
  insert into _fa4_pr2c_pre(k,v)
    select 'allowlist_non_pr2c', count(*)::text from clara.wake_fn_allowlist;

  raise notice 'F-A4 PR-2c prestate: OK — close_prep source exists and is DISABLED (apply-time D1 tripwire); interactive_client carrier CHECKs and chat_turn task kind live; 5 exact prerequisites resolve; 3 targets absent; pre-A8 rung order pinned; 14 untouched prosrc shas captured; 0 of 12 target allowlist rows present.';
end $pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A · TASK CONGRUENCE + THE CHAT-CLOSE CREDENTIAL MINTER.
-- =================================================================================================
create function clara._assert_wake_task_congruent(
    p_task uuid, p_firm uuid, p_client uuid, p_task_kind text) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_task record;
begin
  select t.id,t.firm_id,t.client_id,t.kind into v_task
    from clara.agent_tasks t where t.id=p_task;
  if v_task.id is null or v_task.firm_id is distinct from p_firm
     or v_task.client_id is distinct from p_client or v_task.kind is distinct from p_task_kind then
    raise exception 'the named agent task is not a % task for this firm and client', p_task_kind
      using errcode='CLR11', detail='{"reason":"wake_task_incongruent"}';
  end if;
end $$;
revoke all on function clara._assert_wake_task_congruent(uuid,uuid,uuid,text) from public;

create function clara.mint_chat_close_credential(
    p_firm uuid, p_client uuid, p_agent_task uuid, p_on_behalf_of uuid,
    p_ttl interval default '00:15:00'::interval)
  returns table(credential_id uuid, secret text)
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_secret text; v_id uuid;
begin
  if p_firm is null or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'unknown firm' using errcode='CLR10';
  end if;
  if p_on_behalf_of is null then
    raise exception 'an attended chat-close credential requires its directing human'
      using errcode='CLR10', detail='{"reason":"on_behalf_of_required"}';
  end if;
  if not exists(select 1 from clara.firm_memberships m
      where m.user_id=p_on_behalf_of and m.firm_id=p_firm and m.status='active'
        and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')) then
    raise exception 'on_behalf_of must be an active bookkeeper+ of the firm'
      using errcode='CLR10', detail='{"reason":"on_behalf_of_incongruent"}';
  end if;
  if p_client is null or not exists(select 1 from clara.clients c
      where c.id=p_client and c.firm_id=p_firm and c.status='active') then
    raise exception 'interactive_client wake requires a firm-congruent active client'
      using errcode='CLR10', detail='{"reason":"interactive_client_client_incongruent"}';
  end if;
  if p_agent_task is null then
    raise exception 'a task-bound wake credential requires its agent task'
      using errcode='CLR10', detail='{"reason":"wake_task_unbound"}';
  end if;
  perform clara._assert_wake_task_congruent(p_agent_task,p_firm,p_client,'chat_turn');
  if not exists(select 1 from clara.agent_tasks t where t.id=p_agent_task
      and t.status in ('queued','running','awaiting_input')) then
    raise exception 'the chat turn is not live enough to mint fresh close authority'
      using errcode='CLR13', detail='{"reason":"wake_task_not_live"}';
  end if;
  v_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at,agent_task_id)
    values('interactive_client',p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl,p_agent_task)
    returning id into v_id;
  return query select v_id,v_secret;
end $$;
revoke all on function clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval) from public;

-- =================================================================================================
-- §B · A8 — ATTENDED AUTHORITY MAY NEVER EXCEED THE DIRECTING HUMAN.
-- The mapping is closed and immutable in vocabulary; the function is STABLE because membership and
-- capability are live authority facts and must be re-read on every call.
-- =================================================================================================
create function clara._assert_attended_close_floor(
    p_verb text, p_firm uuid, p_on_behalf_of uuid) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_min_role text; v_capability text; v_rank int;
begin
  case p_verb
    when 'wake_list_fiscal_years','wake_get_close_plan','wake_get_close_readiness',
         'wake_verify_close','wake_snapshot_state','wake_dry_run_close_readiness',
         'wake_mint_month_snapshot'
      then v_min_role:='viewer'; v_capability:=null;
    when 'wake_open_fiscal_year'
      then v_min_role:='admin'; v_capability:=null;
    when 'wake_begin_close','wake_abandon_close'
      then v_min_role:='bookkeeper'; v_capability:='close_and_attest';
    when 'wake_propose_close','wake_run_depreciation_catchup'
      then v_min_role:='bookkeeper'; v_capability:=null;
    else
      raise exception 'no attended close authority mapping exists for %', coalesce(p_verb,'null')
        using errcode='CLR10', detail='{"reason":"attended_close_verb_unmapped"}';
  end case;
  select clara.role_rank(m.role) into v_rank from clara.firm_memberships m
    where m.user_id=p_on_behalf_of and m.firm_id=p_firm and m.status='active';
  if v_rank is null or v_rank<clara.role_rank(v_min_role) then
    raise exception 'insufficient role for attended close verb %', p_verb
      using errcode='CLR04', detail=jsonb_build_object(
        'reason','insufficient_role','required_role',v_min_role,'verb',p_verb)::text;
  end if;
  if v_capability is not null
     and not clara._has_capability(p_firm,p_on_behalf_of,v_capability) then
    raise exception 'this attended close act takes the % capability', v_capability
      using errcode='CLR04', detail=jsonb_build_object(
        'reason','capability_missing','capability',v_capability)::text;
  end if;
end $$;
revoke all on function clara._assert_attended_close_floor(text,uuid,uuid) from public;

create or replace function clara._close_wake_ctx(p_verb text,p_subject_kind text,p_subject_id uuid,p_op_key text)
  returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; v_task uuid; v_client uuid; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode='CLR03',
      detail='{"reason":"no_wake_credential"}';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind,p_verb);
  if w.on_behalf_of is not null then
    perform clara._assert_attended_close_floor(p_verb,w.firm_id,w.on_behalf_of);
  end if;
  v_client:=clara._close_subject_client(p_subject_kind,p_subject_id);
  if w.client_id is null or v_client is null or w.client_id is distinct from v_client then
    raise exception 'wake close authority is not pinned to this subject' using errcode='CLR03',
      detail='{"reason":"wake_client_pin_mismatch"}';
  end if;
  v_task:=clara._wake_task_id();
  if v_task is null then
    raise exception 'this wake credential names no agent task' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if p_op_key is distinct from clara._close_expected_op_key(v_task,p_verb,p_subject_id) then
    raise exception 'the supplied op_key is not the derived key for this (task, verb, subject)'
      using errcode='CLR10', detail='{"reason":"op_key_not_derived"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id=v_client;
  if v_firm is null or v_firm is distinct from w.firm_id then
    raise exception 'the subject is not in this credential''s firm' using errcode='CLR11',
      detail='{"reason":"fiscal_year_not_in_firm"}';
  end if;
  return jsonb_build_object('firm_id',w.firm_id,'client_id',v_client,
    'wake_kind',w.wake_kind,'on_behalf_of',w.on_behalf_of,'task_id',v_task);
end $$;

-- =================================================================================================
-- §C · EXACTLY TWELVE interactive_client rows. Existing wrapper grants already admit the shared
-- clara_wake_interactive role; no wrapper ACL changes here.
-- =================================================================================================
insert into clara.wake_fn_allowlist(wake_kind,function_name) values
  ('interactive_client','wake_list_fiscal_years'),
  ('interactive_client','wake_get_close_plan'),
  ('interactive_client','wake_get_close_readiness'),
  ('interactive_client','wake_verify_close'),
  ('interactive_client','wake_snapshot_state'),
  ('interactive_client','wake_dry_run_close_readiness'),
  ('interactive_client','wake_open_fiscal_year'),
  ('interactive_client','wake_begin_close'),
  ('interactive_client','wake_abandon_close'),
  ('interactive_client','wake_propose_close'),
  ('interactive_client','wake_run_depreciation_catchup'),
  ('interactive_client','wake_mint_month_snapshot');

grant execute on function clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)
  to clara_runtime;

reset role;

-- =================================================================================================
-- §TAIL · MEASURED POSTSTATE.
-- =================================================================================================
do $tail$
declare
  v_sig text; v_role text; v_n int; v_src text; v_grantees text[];
  k_names text[]:=array[
    'wake_list_fiscal_years','wake_get_close_plan','wake_get_close_readiness','wake_verify_close',
    'wake_snapshot_state','wake_dry_run_close_readiness','wake_open_fiscal_year','wake_begin_close',
    'wake_abandon_close','wake_propose_close','wake_run_depreciation_catchup','wake_mint_month_snapshot'];
  k_wrappers text[]:=array[
    'clara.wake_list_fiscal_years(uuid,text,jsonb,text)',
    'clara.wake_get_close_plan(uuid,text,jsonb,text)',
    'clara.wake_get_close_readiness(uuid,uuid,text,jsonb,text)',
    'clara.wake_verify_close(uuid,text,jsonb,text)',
    'clara.wake_snapshot_state(uuid,text,jsonb,text)',
    'clara.wake_dry_run_close_readiness(uuid,uuid,text,jsonb,text)',
    'clara.wake_open_fiscal_year(uuid,text,date,text,jsonb,text)',
    'clara.wake_begin_close(uuid,text,jsonb,text)',
    'clara.wake_abandon_close(uuid,text,text,jsonb,text)',
    'clara.wake_propose_close(uuid,jsonb,text,text,jsonb,text)',
    'clara.wake_run_depreciation_catchup(uuid,date,text,jsonb,text)',
    'clara.wake_mint_month_snapshot(uuid,date,text,jsonb,text)'];
  k_reserved text[]:=array[
    'clara.finalize_close(uuid,text,text)',
    'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)',
    'clara.attest_close_exception(uuid,text,text,text,text,uuid)',
    'clara.settle_close_proposal(uuid,text,text,text)'];
begin
  if current_user<>(select v from _fa4_pr2c_pre where k='session_user')
     or current_role<>(select v from _fa4_pr2c_pre where k='current_role') then
    raise exception 'F-A4 PR-2c tail: role not reset' using errcode='CLR10';
  end if;

  -- T.1 · Exact new function postures and grants.
  foreach v_sig in array array[
    'clara._assert_wake_task_congruent(uuid,uuid,uuid,text)',
    'clara._assert_attended_close_floor(text,uuid,uuid)',
    'clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)'] loop
    if to_regprocedure(v_sig) is null or not exists(select 1 from pg_proc p
        where p.oid=v_sig::regprocedure and p.prosecdef
          and p.proconfig@>array['search_path=clara, pg_temp']
          and pg_get_userbyid(p.proowner)='clara_fn_owner') then
      raise exception 'F-A4 PR-2c tail: % is absent or has wrong definer posture', v_sig
        using errcode='CLR10';
    end if;
    if exists(select 1 from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=v_sig::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'F-A4 PR-2c tail: PUBLIC executes %', v_sig using errcode='CLR10';
    end if;
  end loop;
  select array_agg(a.grantee::regrole::text order by 1) into v_grantees from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid='clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)'::regprocedure
      and a.privilege_type='EXECUTE' and a.grantee<>'clara_fn_owner'::regrole;
  if v_grantees is distinct from array['clara_runtime'] then
    raise exception 'F-A4 PR-2c tail: mint_chat_close_credential grantees %, expected clara_runtime only',
      coalesce(array_to_string(v_grantees,','),'(none)') using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara._assert_wake_task_congruent(uuid,uuid,uuid,text)',
    'clara._assert_attended_close_floor(text,uuid,uuid)'] loop
    if exists(select 1 from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=v_sig::regprocedure and a.privilege_type='EXECUTE'
          and a.grantee<>'clara_fn_owner'::regrole) then
      raise exception 'F-A4 PR-2c tail: internal % is granted', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- T.2 · Exact interactive_client allowlist for THE CLOSE ROSTER, scoped by function_name.
  -- interactive_client is a SHARED chat kind (bank/freeform/question wrappers already carry rows
  -- under it), so a bare wake_kind='interactive_client' count is not this file's to own. The
  -- prestate's allowlist_non_pr2c value is deliberately the WHOLE-table total for the global +12
  -- delta below; every roster assertion is scoped to k_names, never a bare kind count.
  select count(*)::int into v_n from clara.wake_fn_allowlist
    where wake_kind='interactive_client' and function_name=any(k_names);
  if v_n<>12 then
    raise exception 'F-A4 PR-2c tail: interactive_client carries % close-wrapper allowlist rows, expected 12', v_n
      using errcode='CLR10';
  end if;
  if exists(select 1 from unnest(k_names) n where not exists(
       select 1 from clara.wake_fn_allowlist w
        where w.wake_kind='interactive_client' and w.function_name=n)) then
    raise exception 'F-A4 PR-2c tail: a close wrapper is missing its interactive_client allowlist row' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist;
  if v_n<>(select v::int from _fa4_pr2c_pre where k='allowlist_non_pr2c')+12 then
    raise exception 'F-A4 PR-2c tail: allowlist moved by something other than the 12 additions'
      using errcode='CLR10';
  end if;
  foreach v_sig in array k_wrappers loop
    if not has_function_privilege('clara_wake_interactive',v_sig,'EXECUTE') then
      raise exception 'F-A4 PR-2c tail: existing shared role cannot execute %', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- T.3 · Human-reserved acts remain unreachable from EVERY extant wake role, including logins.
  for v_role in select rolname from pg_roles where rolname like 'clara_wake_%' loop
    foreach v_sig in array k_reserved loop
      if has_function_privilege(v_role,v_sig,'EXECUTE') then
        raise exception 'F-A4 PR-2c tail: wake role % can execute reserved human door %',v_role,v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- T.4 · The only intended old-body change is _close_wake_ctx, with A8 between allowlist and pin.
  select p.prosrc into v_src from pg_proc p
    where p.oid='clara._close_wake_ctx(text,text,uuid,text)'::regprocedure;
  if position('if w.on_behalf_of is not null then' in v_src)=0
     or position('perform clara._assert_attended_close_floor(p_verb,w.firm_id,w.on_behalf_of);' in v_src)=0
     or position('perform clara.assert_wake_allowed(w.wake_kind,p_verb);' in v_src)
        > position('perform clara._assert_attended_close_floor' in v_src)
     or position('perform clara._assert_attended_close_floor' in v_src)
        > position('v_client:=clara._close_subject_client' in v_src) then
    raise exception 'F-A4 PR-2c tail: _close_wake_ctx A8 is absent or out of rung order'
      using errcode='CLR10';
  end if;
  foreach v_sig in array (k_wrappers||array[
      'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)',
      'clara.wake_context()']) loop
    if encode(sha256(convert_to((select p.prosrc from pg_proc p where p.oid=v_sig::regprocedure),'UTF8')),'hex')
       is distinct from (select v from _fa4_pr2c_pre where k='prosrc_sha:'||v_sig) then
      raise exception 'F-A4 PR-2c tail: promised-untouched body % moved',v_sig using errcode='CLR10';
    end if;
  end loop;

  -- T.5 · Only the minter reads a lawful bare clock; both authority helpers are clock-free.
  foreach v_sig in array array[
    'clara._assert_wake_task_congruent(uuid,uuid,uuid,text)',
    'clara._assert_attended_close_floor(text,uuid,uuid)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    if v_src~* '\m(now|statement_timestamp|clock_timestamp|current_date)\M' then
      raise exception 'F-A4 PR-2c tail: authority helper % unexpectedly reads a clock',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  if not exists(select 1 from clara.wake_engine_sources
      where source_key='close_prep' and enabled=false) then
    raise exception 'F-A4 PR-2c tail: close_prep source moved from disabled during apply'
      using errcode='CLR10';
  end if;

  raise notice 'F-A4 PR-2c tail: OK — apply-time D1 tripwire observed close_prep enabled=false; 3 exact definer functions landed; mint_chat_close_credential is clara_runtime-only and both authority helpers are ungranted/PUBLIC-refused/clock-free; exactly 12 interactive_client allowlist rows match the existing wrapper roster and every wrapper remains executable by clara_wake_interactive; finalize/reopen/attest/settle remain unreachable from EVERY extant clara_wake_* role; A8 is positioned allowlist -> attended floor -> client pin; mint_wake_credential_for_task, wake_context and all 12 wrappers are byte-identical to prestate; close_prep remains disabled.';
end $tail$;
