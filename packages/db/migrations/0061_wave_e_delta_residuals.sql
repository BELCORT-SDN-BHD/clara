-- 0061_wave_e_delta_residuals.sql -- Wave E delta closes the gamma context-pack
-- residuals and the normalized metric-cell provenance omission wall.
-- Migration number is claimed at merge time. This file PATCHES the live read body through
-- pg_get_functiondef; it never rebuilds a historical generation and adds no public grant.
--
-- D1 WRITE-QUIESCE: get_context_pack is a read surface, not an audited writer. No writer body
-- changes here. The timeout is precautionary; the catalog surgery and bounded reads are small.
set local statement_timeout = '2min';
do $provenance_pre$ begin
  if to_regprocedure('clara._tf_metric_cell_provenance_complete()') is not null
     or exists(select 1 from pg_trigger where not tgisinternal and tgname=any(array[
       't_metric_cell_provenance_complete','t_metric_cell_periods_complete','t_metric_cell_snapshots_complete',
       't_metric_cell_account_sets_complete','t_metric_cell_constants_complete','t_metric_cell_entries_complete',
       't_metric_cell_documents_complete','t_metric_cell_presentation_maps_complete'])) then
    raise exception 'delta residual partial birth: metric-cell provenance completeness objects already exist'
      using errcode='CLR10';
  end if;
end $provenance_pre$;
set role clara_fn_owner;

-- Deferred reconstruction closes omission as well as forged-addition attacks on every
-- normalized metric-cell provenance family. The function is born under the function-owner wall.
-- The target cell id is resolved with branching ASSIGNMENTS, never one CASE expression: PL/pgSQL
-- compiles every reference inside a single expression together, so a CASE naming old.cell_id would
-- fail to compile on clara.metric_cells (whose OLD rowtype has no cell_id) before its guard ever ran.
create function clara._tf_metric_cell_provenance_complete() returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$declare c record;p jsonb;e uuid[];a uuid[];n text;targets text[];target_cell uuid;manifest_key text;begin if tg_table_name='metric_cells'then target_cell:=new.id;elsif tg_op='DELETE'then target_cell:=old.cell_id;else target_cell:=new.cell_id;end if;select mc.*,ec.snapshot_id into strict c from clara.metric_cells mc join clara.metric_evaluation_contexts ec on ec.id=mc.evaluation_context_id where mc.id=target_cell;p:=c.inputs->'normalized_provenance';if p is null or jsonb_typeof(p)<>'object'then raise exception 'cell normalized provenance manifest is absent'using errcode='CLR11';end if;targets:=case when tg_table_name='metric_cells'then array['metric_cell_periods','metric_cell_snapshots','metric_cell_account_sets','metric_cell_constants','metric_cell_entries','metric_cell_documents','metric_cell_presentation_maps']else array[tg_table_name]end;foreach n in array targets loop manifest_key:=case n when'metric_cell_periods'then'period_ids'when'metric_cell_snapshots'then'snapshot_ids'when'metric_cell_account_sets'then'account_set_version_ids'when'metric_cell_constants'then'constant_version_ids'when'metric_cell_entries'then'entry_ids'when'metric_cell_documents'then'document_ids'else'presentation_map_version_ids'end;
-- AN ABSENT KEY IS NOT AN EMPTY LIST. jsonb_array_elements_text on a missing key yields zero rows,
-- so a manifest that simply OMITS a family would compare equal to an empty child table and pass --
-- a belt that fails open exactly where the primary integrity trigger has been bypassed, which is
-- the only circumstance this deferred wall exists for. Present-and-empty stays lawful.
if not(p?manifest_key)then raise exception 'cell normalized provenance omits the % family',n using errcode='CLR11',detail=jsonb_build_object('reason','normalized_provenance_family_absent','family',n,'manifest_key',manifest_key,'fix','emit every provenance family key in normalized_provenance, using an empty array where the family has no rows')::text;end if;
e:=array(select jsonb_array_elements_text(p->manifest_key)::uuid);if n='metric_cell_periods'then select coalesce(array_agg(period_id order by ordinal),'{}')into a from clara.metric_cell_periods where cell_id=c.id;elsif n='metric_cell_snapshots'then select coalesce(array_agg(snapshot_id order by snapshot_id),'{}')into a from clara.metric_cell_snapshots where cell_id=c.id;elsif n='metric_cell_account_sets'then select coalesce(array_agg(account_set_version_id order by account_set_version_id),'{}')into a from clara.metric_cell_account_sets where cell_id=c.id;elsif n='metric_cell_constants'then select coalesce(array_agg(constant_version_id order by constant_version_id),'{}')into a from clara.metric_cell_constants where cell_id=c.id;elsif n='metric_cell_entries'then select coalesce(array_agg(entry_id order by entry_id),'{}')into a from clara.metric_cell_entries where cell_id=c.id;elsif n='metric_cell_documents'then select coalesce(array_agg(document_id order by document_id),'{}')into a from clara.metric_cell_documents where cell_id=c.id;elsif n='metric_cell_presentation_maps'then select coalesce(array_agg(presentation_map_version_id order by presentation_map_version_id),'{}')into a from clara.metric_cell_presentation_maps where cell_id=c.id;else raise exception 'unsupported cell provenance target %',n using errcode='CLR10';end if;if a is distinct from e then raise exception 'cell normalized provenance does not reconstruct evaluator/context result'using errcode='CLR11';end if;end loop;return null;end$$;
revoke all on function clara._tf_metric_cell_provenance_complete()from public;
create constraint trigger t_metric_cell_provenance_complete after insert on clara.metric_cells deferrable initially deferred for each row execute function clara._tf_metric_cell_provenance_complete();
do $$declare n text;begin foreach n in array array['metric_cell_periods','metric_cell_snapshots','metric_cell_account_sets','metric_cell_constants','metric_cell_entries','metric_cell_documents','metric_cell_presentation_maps']loop execute format('create constraint trigger %I after insert or update or delete on clara.%I deferrable initially deferred for each row execute function clara._tf_metric_cell_provenance_complete()','t_'||n||'_complete',n);end loop;end$$;
reset role;

create temp table _xdelta_residual_pre(
  secdef boolean not null,
  config text not null,
  acl text not null,
  owner text not null
) on commit drop;

do $pre$
declare
  v_sig text := 'clara.get_context_pack(uuid,text)';
  v_def text;
  v_cnt int;
begin
  if to_regclass('clara.reporting_periods') is null
     or to_regclass('clara.period_snapshots') is null
     or to_regclass('clara.snapshot_assessments') is null
     or to_regprocedure('clara._snapshot_state_core(uuid)') is null then
    raise exception 'delta residual prestate: the 0057 period/snapshot registry is incomplete'
      using errcode = 'CLR10';
  end if;

  insert into _xdelta_residual_pre(secdef, config, acl, owner)
  select p.prosecdef, coalesce(p.proconfig::text, ''), coalesce(p.proacl::text, ''),
         p.proowner::regrole::text
    from pg_proc p where p.oid = v_sig::regprocedure;
  if (select count(*) from _xdelta_residual_pre) <> 1 then
    raise exception 'delta residual prestate: get_context_pack posture could not be stashed'
      using errcode = 'CLR10';
  end if;

  select pg_get_functiondef(v_sig::regprocedure) into v_def;
  if position('''period_snapshot_registry''' in v_def) <> 0
     or position('''pack_schema_version'',5' in v_def) <> 0 then
    raise exception 'delta residual prestate: get_context_pack already carries the v5 period/snapshot block'
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array[
    'sst_registration_watch', '''wiki''', '-''bound_scope_kind''-''bound_scope_id''',
    '''stale_at'',wc.stale_at', '''has_stale_sources''', '''entity_type''', '''msic'''
  ] loop
    if position(v_sig in v_def) = 0 then
      raise exception 'delta residual prestate: get_context_pack lost prior-generation marker %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  v_cnt := (length(v_def) - length(replace(v_def, '''pack_schema_version'',4', '')))
           / length('''pack_schema_version'',4');
  if v_cnt <> 1 then
    raise exception 'delta residual prestate: v4 schema anchor appears % time(s), expected exactly one', v_cnt
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

create function clara._period_snapshot_registry_pack_v1(p_client uuid) returns jsonb
  language sql stable security definer set search_path=clara,pg_temp as $helper$
  select jsonb_build_object(
    'ordering','period_start_desc_then_period_id',
    'limit',12,
    'total_count',(select count(*) from clara.reporting_periods rp0 where rp0.client_id=p_client),
    'truncated',((select count(*) from clara.reporting_periods rp0 where rp0.client_id=p_client)>12),
    'periods',coalesce((select jsonb_agg(jsonb_build_object(
      'reporting_period_id',rp.id,'grain',rp.grain,
      'period_start',rp.period_start,'period_end',rp.period_end,
      'snapshots',jsonb_build_object(
        'ordering','recent_by_minted_at','limit',5,
        'total_count',(select count(*) from clara.period_snapshots ps0 where ps0.reporting_period_id=rp.id),
        'truncated',((select count(*) from clara.period_snapshots ps0 where ps0.reporting_period_id=rp.id)>5),
        'recent_by_minted_at',coalesce((select jsonb_agg(jsonb_build_object(
          'snapshot_id',ps.id,'kind',ps.kind,'minted_at',ps.minted_at,
          'state',clara._snapshot_state_core(ps.id)) order by ps.minted_at desc,ps.id desc)
          from (select ps1.id,ps1.kind,ps1.minted_at from clara.period_snapshots ps1
            where ps1.reporting_period_id=rp.id order by ps1.minted_at desc,ps1.id desc limit 5) ps),
          '[]'::jsonb))) order by rp.period_start desc,rp.id desc)
      from (select rp1.id,rp1.grain,rp1.period_start,rp1.period_end
        from clara.reporting_periods rp1 where rp1.client_id=p_client
        order by rp1.period_start desc,rp1.id desc limit 12) rp),'[]'::jsonb))
$helper$;
revoke all on function clara._period_snapshot_registry_pack_v1(uuid) from public;

do $patch$
declare
  v_sig text := 'clara.get_context_pack(uuid,text)';
  v_def text;
  v_anchor text;
  v_block text;
  v_cnt int;
begin
  select pg_get_functiondef(v_sig::regprocedure) into v_def;

  v_cnt := (length(v_def) - length(replace(v_def, '''pack_schema_version'',4', '')))
           / length('''pack_schema_version'',4');
  if v_cnt <> 1 then
    raise exception 'delta residual patch: v4 schema anchor appears % time(s), expected exactly one', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, '''pack_schema_version'',4', '''pack_schema_version'',5');

  -- Insert one helper call immediately before the existing client member. The helper owns the
  -- bounded JSON expression, keeping this live-body surgery syntactically small and countable.
  v_anchor := $a$      'client',jsonb_build_object$a$;
  v_cnt := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_cnt <> 1 then
    raise exception 'delta residual patch: client-member anchor appears % time(s), expected exactly one', v_cnt
      using errcode = 'CLR10';
  end if;
  v_block := $b$      'period_snapshot_registry',clara._period_snapshot_registry_pack_v1(cl.id),
      'client',jsonb_build_object$b$;

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;

  select pg_get_functiondef(v_sig::regprocedure) into v_def;
  foreach v_anchor in array array[
    '''pack_schema_version'',5', '''period_snapshot_registry''',
    'clara._period_snapshot_registry_pack_v1(cl.id)',
    'sst_registration_watch', '''wiki''', '-''bound_scope_kind''-''bound_scope_id''',
    '''stale_at'',wc.stale_at', '''has_stale_sources''', '''entity_type''', '''msic'''
  ] loop
    if position(v_anchor in v_def) = 0 then
      raise exception 'delta residual postcheck: marker % is missing from get_context_pack', v_anchor
        using errcode = 'CLR10';
    end if;
  end loop;
  select pg_get_functiondef('clara._period_snapshot_registry_pack_v1(uuid)'::regprocedure)
    into v_block;
  if position('payload' in v_block) <> 0
     or position('books_watermark' in v_block) <> 0
     or position('dataset_sha256' in v_block) <> 0 then
    raise exception 'delta residual postcheck: period/snapshot pack exposes forbidden snapshot bytes or lineage numerals'
      using errcode = 'CLR10';
  end if;
end $patch$;

reset role;

do $tail$
declare
  r record;
  v_def text;
  v_n int;
begin
  select s.*, p.prosecdef as now_secdef, coalesce(p.proconfig::text, '') as now_config,
         coalesce(p.proacl::text, '') as now_acl, p.proowner::regrole::text as now_owner
    into r
    from _xdelta_residual_pre s
    join pg_proc p on p.oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if r.now_secdef is distinct from r.secdef
     or r.now_config is distinct from r.config
     or r.now_acl is distinct from r.acl
     or r.now_owner is distinct from r.owner then
    raise exception 'delta residual tail: get_context_pack security posture changed (secdef %->%, config %->%, acl %->%, owner %->%)',
      r.secdef, r.now_secdef, r.config, r.now_config, r.acl, r.now_acl, r.owner, r.now_owner
      using errcode = 'CLR10';
  end if;

  -- No raw registry access and no direct snapshot door for the agent. The ONLY widened
  -- surface is the already-granted, client/tenant-pinned context pack.
  foreach v_def in array array['reporting_periods','period_snapshots','snapshot_assessments'] loop
    if has_table_privilege('clara_agent_ro', 'clara.' || v_def, 'select') then
      raise exception 'delta residual tail: clara_agent_ro gained raw SELECT on clara.%', v_def
        using errcode = 'CLR10';
    end if;
  end loop;
  foreach v_def in array array[
    'clara.mint_month_snapshot(uuid,date,text)',
    'clara.snapshot_state(uuid)',
    'clara.verify_snapshot(uuid)',
    'clara.days_in_period(uuid)'
  ] loop
    if has_function_privilege('clara_agent_ro', v_def, 'execute') then
      raise exception 'delta residual tail: clara_agent_ro gained direct EXECUTE on %', v_def
        using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_agent_ro',
       'clara.get_context_pack(uuid,text)', 'execute') then
    raise exception 'delta residual tail: the existing agent context-pack door is dark'
      using errcode = 'CLR10';
  end if;
  if not exists(
    select 1 from pg_proc p
    where p.oid='clara._tf_metric_cell_provenance_complete()'::regprocedure
      and p.prosecdef and p.proowner='clara_fn_owner'::regrole
      and p.proconfig @> array['search_path=clara, pg_temp']
  ) then
    raise exception 'delta residual tail: metric-cell provenance trigger function posture is wrong'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from(values
    ('t_metric_cell_provenance_complete','clara.metric_cells'::regclass),
    ('t_metric_cell_periods_complete','clara.metric_cell_periods'::regclass),
    ('t_metric_cell_snapshots_complete','clara.metric_cell_snapshots'::regclass),
    ('t_metric_cell_account_sets_complete','clara.metric_cell_account_sets'::regclass),
    ('t_metric_cell_constants_complete','clara.metric_cell_constants'::regclass),
    ('t_metric_cell_entries_complete','clara.metric_cell_entries'::regclass),
    ('t_metric_cell_documents_complete','clara.metric_cell_documents'::regclass),
    ('t_metric_cell_presentation_maps_complete','clara.metric_cell_presentation_maps'::regclass)
  ) expected(name,relation)
  join pg_trigger t on t.tgname=expected.name and t.tgrelid=expected.relation
    and t.tgfoid='clara._tf_metric_cell_provenance_complete()'::regprocedure
    and not t.tgisinternal and t.tgdeferrable and t.tginitdeferred;
  if v_n <> 8 then
    raise exception 'delta residual tail: metric-cell provenance has % exact deferred trigger(s), expected eight', v_n
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='get_context_pack';
  if v_n <> 1 then
    raise exception 'delta residual tail: get_context_pack has % overload(s), expected one', v_n
      using errcode = 'CLR10';
  end if;

  raise notice 'delta residual OK: get_context_pack v5; period limit=12; snapshot limit=5; state=seq-ledger; metadata only; provenance owner=clara_fn_owner; provenance triggers=8; agent raw tables=0; agent snapshot RPCs=0; prior security posture preserved.';
end $tail$;
