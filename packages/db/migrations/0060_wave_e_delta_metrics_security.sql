-- Wave E lane delta: residual metrics security and integrity.
-- Number claimed at merge. Apply third: base -> behavior -> security.
-- The timeout is precautionary; this file adds only bounded catalog triggers and policies.
set local statement_timeout = '2min';
create temp table _delta_security_roster(
  table_name text primary key,
  agent_catalog boolean not null default false
) on commit drop;
insert into _delta_security_roster(table_name,agent_catalog) values
  ('metric_units',false),('metric_temporalities',false),('metric_primitives',false),
  ('metric_na_reason_versions',false),('metric_constants',true),
  ('edge_policy_sets',true),('metric_edge_policies',true),
  ('averaging_policy_versions',false),('account_sets',true),
  ('account_set_versions',true),('account_set_version_members',false),
  ('presentation_maps',true),('presentation_map_versions',true),
  ('presentation_map_version_members',false),('metric_definitions',true),
  ('metric_definition_versions',true),('metric_input_producer_versions',false),
  ('metric_input_producer_version_members',false),
  ('metric_input_snapshots',false),('metric_input_snapshot_periods',false),
  ('metric_input_snapshot_contributions',false),
  ('metric_input_snapshot_open_items',false),
  ('metric_input_snapshot_allocations',false),
  ('metric_input_snapshot_samples',false),('evaluator_versions',false),
  ('evaluator_version_members',false),('metric_evaluation_contexts',false),
  ('metric_evaluation_context_periods',false),('metric_cells',false),
  ('metric_cell_periods',false),('metric_cell_snapshots',false),
  ('metric_cell_account_sets',false),('metric_cell_constants',false),
  ('metric_cell_entries',false),('metric_cell_documents',false),
  ('metric_cell_presentation_maps',false),('metric_cell_assessments',false),
  ('metric_evaluation_attempt_receipts',false);
create temp table _delta_security_meta(k text primary key,v text not null) on commit drop;
insert into _delta_security_meta values('deploy_user',current_user),('deploy_role',current_role);

do $pre$
declare r record; v_missing text; v_rls int; v_append int; v_truncate int;
  v_refs int; v_docs int; v_lifecycle int; v_agent int:=0;
begin
  select string_agg(table_name,', ' order by table_name) into v_missing
    from _delta_security_roster where to_regclass('clara.'||table_name) is null;
  if v_missing is not null then
    raise exception 'delta security prestate: base tables absent: %',v_missing using errcode='CLR10';
  end if;
  if (select count(*) from _delta_security_roster)<>38 then
    raise exception 'delta security prestate: roster is not 38 tables' using errcode='CLR10';
  end if;
  foreach v_missing in array array[
    'clara._tf_append_only()','clara._tf_no_truncate()',
    'clara._tf_metric_catalog_scope()','clara._tf_metric_document_binding()',
    'clara._active_document_filing(uuid,text,uuid,boolean)','clara.wake_firm()',
    'clara.verify_metric_input_producer_freeze()','clara.verify_evaluator_freeze()'
  ] loop
    if to_regprocedure(v_missing) is null then
      raise exception 'delta security prestate: helper absent: %',v_missing using errcode='CLR10';
    end if;
  end loop;
  select count(*) filter(where c.relrowsecurity and c.relforcerowsecurity),
    count(*) filter(where exists(select 1 from pg_trigger t where t.tgrelid=c.oid
      and t.tgfoid='clara._tf_append_only()'::regprocedure and not t.tgisinternal)),
    count(*) filter(where exists(select 1 from pg_trigger t where t.tgrelid=c.oid
      and t.tgfoid='clara._tf_no_truncate()'::regprocedure and not t.tgisinternal))
    into v_rls,v_append,v_truncate
    from _delta_security_roster rr join pg_class c on c.oid=('clara.'||rr.table_name)::regclass;
  select count(*) into v_refs from pg_trigger where not tgisinternal
    and tgfoid='clara._tf_metric_catalog_scope()'::regprocedure;
  select count(*) into v_docs from pg_trigger where not tgisinternal
    and tgfoid='clara._tf_metric_document_binding()'::regprocedure;
  select count(*) into v_lifecycle from pg_trigger t join pg_proc f on f.oid=t.tgfoid
    where not t.tgisinternal and t.tgenabled='O' and t.tgtype=27 and((t.tgname='t_metricdefinitionversions_lifecycle'and t.tgrelid='clara.metric_definition_versions'::regclass and t.tgfoid='clara._tf_metric_definition_lifecycle_v1()'::regprocedure and lower(f.prosrc)like'%clr16%')or(t.tgname='t_accountsetversions_lifecycle'and t.tgrelid='clara.account_set_versions'::regclass and t.tgfoid='clara._tf_account_set_version_lifecycle()'::regprocedure))and f.prosecdef and f.proconfig@>array['search_path=clara, pg_temp'];
  for r in select * from _delta_security_roster loop
    if has_table_privilege('clara_agent_ro','clara.'||r.table_name,'select') then v_agent:=v_agent+1; end if;
  end loop;
  if v_rls<>38 or v_append<>36 or v_truncate<>38 or v_refs<>22 or v_docs<>2
     or v_lifecycle<>2 or v_agent<>9 then
    raise exception 'delta security prestate: RLS %, append %, truncate %, refs %, docs %, lifecycles %, agent SELECT %',
      v_rls,v_append,v_truncate,v_refs,v_docs,v_lifecycle,v_agent using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='clara.evaluator_versions'::regclass
      and tgfoid='clara._tf_append_only()'::regprocedure and not tgisinternal) then
    raise exception 'delta security prestate: evaluator append-only target is absent' using errcode='CLR10';
  end if;
  perform clara.verify_metric_input_producer_freeze();perform clara.verify_account_set_version_freeze(id)from clara.account_set_versions;
  if (select count(*) from clara.metric_input_producer_versions)<>1 or (select count(*) from clara.metric_input_producer_version_members)<>15 then
    raise exception 'delta security prestate: producer closure registry is incomplete' using errcode='CLR10';end if;
  if (select count(*) from clara.evaluator_versions where deployed)<>0 or (select count(*) from clara.evaluator_versions)<>2 then
    raise exception 'delta security prestate: evaluators must be complete and undeployed' using errcode='CLR10';end if;
end $pre$;
grant select on _delta_security_roster,_delta_security_meta to clara_fn_owner;

set role clara_fn_owner;

-- Definition lifecycle belongs to behavior. Only evaluator_versions replaces its base wall.
drop trigger t_evaluatorversions_append_only on clara.evaluator_versions;
create function clara._tf_evaluator_deploy_once() returns trigger
  language plpgsql security invoker set search_path=clara,pg_temp as $deploy$
begin
  if tg_op='INSERT' then if new.deployed then raise exception 'evaluator versions must be born undeployed' using errcode='CLR08';end if;return new;end if;
  if tg_op='DELETE' then raise exception 'evaluator versions are historical' using errcode='CLR08'; end if;
  if current_user<>session_user then raise exception 'evaluator deployment requires the migration ceremony principal'using errcode='CLR08';end if;
  if (to_jsonb(new)-'deployed')is distinct from(to_jsonb(old)-'deployed')or old.deployed or not new.deployed then
    raise exception 'evaluator version admits only one undeployed-to-deployed transition' using errcode='CLR08';end if;
  perform clara.verify_evaluator_freeze();return new;
end $deploy$;
revoke all on function clara._tf_evaluator_deploy_once() from public;
create trigger t_evaluatorversions_deploy_once before insert or update or delete on clara.evaluator_versions for each row execute function clara._tf_evaluator_deploy_once();
alter table clara.metric_cells alter column model_proposal_provenance set default '{"kind":"not_applicable","version":1,"reason":"evaluator_originated"}',alter column human_approval_provenance set default '{"kind":"not_applicable","version":1,"reason":"no_numeric_approval"}';
-- Every captured primitive is an exact source projection; allocations must cite a captured item.
create function clara._tf_metric_snapshot_fact_identity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $source$
begin
  if tg_table_name='metric_input_snapshot_open_items' then
    if not exists(select 1 from clara.open_items o where o.id=new.item_id
        and o.firm_id=new.firm_id and o.client_id=new.client_id and o.domain=new.domain
        and o.counterparty_id=new.counterparty_id and o.entry_id=new.entry_id
        and o.item_kind=new.item_kind and o.item_date=new.item_date
        and o.due_date is not distinct from new.due_date and o.amount_cents=new.amount_cents) then
      raise exception 'metric open-item fact is not its exact source row' using errcode='CLR11'; end if;
  elsif tg_table_name='metric_input_snapshot_allocations' then
    if not exists(select 1 from clara.open_item_allocations a
        join clara.metric_input_snapshot_open_items o on o.snapshot_id=new.snapshot_id
          and o.item_id=a.item_id and o.firm_id=new.firm_id and o.client_id=new.client_id and o.domain=new.domain
        where a.id=new.allocation_id and a.item_id=new.item_id and a.firm_id=new.firm_id
          and a.client_id=new.client_id and a.domain=new.domain and a.effective_date=new.effective_date
          and a.amount_cents=new.amount_cents and a.operation_kind=new.operation_kind
          and a.application_group=new.application_group) then
      raise exception 'metric allocation fact is not its exact source row and captured item' using errcode='CLR11'; end if;
  elsif tg_table_name='metric_input_snapshot_samples' then
    if not exists(select 1 from clara.coa_accounts a where a.account_id=new.account_id
        and a.firm_id=new.firm_id and a.client_id=new.client_id and a.account_code=new.account_code
        and a.account_type=new.account_type and a.account_class is not distinct from new.account_class)then
      raise exception 'metric sample sign metadata is not its exact captured account identity' using errcode='CLR11';end if;
    if new.sample_date<>new.period_start-1 and new.sample_date<>new.period_end
       and (new.sample_date<>(date_trunc('month',new.sample_date)+interval '1 month - 1 day')::date
         or new.sample_date not between new.period_start and new.period_end) then
      raise exception 'metric sample date is outside the closed calendar sample set' using errcode='CLR11';
    end if;
    if new.balance_cents<>(select coalesce(sum(jl.debit_cents-jl.credit_cents),0)::bigint
        from clara.coa_accounts a left join clara.journal_lines jl
          join clara.journal_entries je on je.id=jl.entry_id and je.status='approved'
            and je.firm_id=new.firm_id and je.client_id=new.client_id and je.posting_date<=new.sample_date
          on jl.firm_id=new.firm_id and jl.client_id=new.client_id and jl.account_code=a.account_code
        where a.account_id=new.account_id and a.firm_id=new.firm_id and a.client_id=new.client_id) then
      raise exception 'metric sample balance is not its exact approved-books value' using errcode='CLR11'; end if;
  else raise exception 'unsupported metric snapshot fact target %',tg_table_name using errcode='CLR10';
  end if;
  return new;
end $source$;revoke all on function clara._tf_metric_snapshot_fact_identity() from public;
create constraint trigger t_metric_open_item_identity after insert or update on clara.metric_input_snapshot_open_items deferrable initially immediate for each row execute function clara._tf_metric_snapshot_fact_identity();
create constraint trigger t_metric_allocation_identity after insert or update on clara.metric_input_snapshot_allocations deferrable initially immediate for each row execute function clara._tf_metric_snapshot_fact_identity();
create constraint trigger t_metric_sample_identity after insert or update on clara.metric_input_snapshot_samples deferrable initially immediate for each row execute function clara._tf_metric_snapshot_fact_identity();

-- A contribution is an exact immutable projection of one approved GL line and its parents.
create function clara._tf_metric_contribution_identity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $fact$
declare v record;
begin
  select jl.entry_id,jl.firm_id line_firm,jl.client_id line_client,
         jl.debit_cents,jl.credit_cents,je.firm_id,je.client_id,je.status,
         je.document_id,je.filing_id,je.source_doc_sha256,je.posting_date,
         a.account_id,a.account_type,a.account_class into v
    from clara.journal_lines jl join clara.journal_entries je on je.id=jl.entry_id
    join clara.coa_accounts a on a.firm_id=jl.firm_id and a.client_id=jl.client_id and a.account_code=jl.account_code
    where jl.id=new.journal_line_id;
  if not found or v.status<>'approved' or v.entry_id<>new.entry_id
     or v.line_firm<>new.firm_id or v.firm_id<>new.firm_id
     or v.line_client<>new.client_id or v.client_id<>new.client_id
     or v.account_id<>new.account_id or v.posting_date<>new.posting_date
     or v.account_type<>new.account_type or v.account_class is distinct from new.account_class
     or v.debit_cents<>new.debit_cents or v.credit_cents<>new.credit_cents
     or v.document_id is distinct from new.document_id
     or v.filing_id is distinct from new.filing_id
     or v.source_doc_sha256 is distinct from new.source_doc_sha256 then
    raise exception 'metric contribution is not the exact approved journal-line fact' using errcode='CLR11';
  end if;
  if new.bound_period_id is null or not exists(select 1
      from clara.metric_input_snapshot_periods p where p.snapshot_id=new.snapshot_id
        and p.firm_id=new.firm_id and p.client_id=new.client_id
        and p.period_id=new.bound_period_id
        and new.posting_date between p.period_start and p.period_end) then
    raise exception 'metric contribution period is not a member of its snapshot' using errcode='CLR11';
  end if;
  return new;
end $fact$;
revoke all on function clara._tf_metric_contribution_identity() from public;
create constraint trigger t_metric_contribution_identity after insert or update
  on clara.metric_input_snapshot_contributions deferrable initially immediate
  for each row execute function clara._tf_metric_contribution_identity();

-- A cell document must resolve through its exact snapshot contribution and retained filing.
create function clara._tf_metric_cell_document_snapshot() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $doc$
begin
  if not exists(select 1 from clara.metric_cells mc
      join clara.metric_evaluation_contexts ec on ec.id=mc.evaluation_context_id and ec.firm_id=mc.firm_id and ec.client_id=mc.client_id
      join clara.metric_input_snapshot_contributions c on c.snapshot_id=ec.snapshot_id and c.firm_id=ec.firm_id and c.client_id=ec.client_id
      join clara.document_filings f on f.id=c.filing_id and f.firm_id=c.firm_id and f.client_id=c.client_id and f.document_id=c.document_id
      where mc.id=new.cell_id and mc.firm_id=new.firm_id and mc.client_id=new.client_id
        and c.document_id=new.document_id) then
    raise exception 'cell document is absent from its evaluation-context snapshot filing evidence' using errcode='CLR11';
  end if;
  return new;
end $doc$;
revoke all on function clara._tf_metric_cell_document_snapshot() from public;
create constraint trigger t_metric_cell_document_snapshot after insert or update
  on clara.metric_cell_documents deferrable initially immediate for each row
  execute function clara._tf_metric_cell_document_snapshot();

-- A supersession points to another version of this same definition and firm/global identity.
create function clara._tf_metric_definition_supersedes_identity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $sup$
begin
  if new.supersedes_version_id is not null and not exists(select 1
      from clara.metric_definition_versions v where v.id=new.supersedes_version_id
        and v.id<>new.id and v.definition_id=new.definition_id
        and v.firm_id is not distinct from new.firm_id and v.revision<new.revision) then
    raise exception 'superseded version is not an earlier revision of the same definition and firm' using errcode='CLR11';
  end if;
  return new;
end $sup$;
revoke all on function clara._tf_metric_definition_supersedes_identity() from public;
create constraint trigger t_metric_definition_supersedes_identity after insert or update
  on clara.metric_definition_versions deferrable initially immediate for each row
  execute function clara._tf_metric_definition_supersedes_identity();

create function clara._tf_metric_context_integrity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $context$
declare s record;p uuid[];
begin
  if not exists(select 1 from clara.evaluator_versions e where e.id=new.evaluator_version_id and e.deployed and e.evaluator_name='evaluate_metric' and e.entrypoint_signature='clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)' and(e.firm_id is null or e.firm_id=new.firm_id)and exists(select 1 from clara.evaluator_version_members m where m.evaluator_version_id=e.id and m.member_signature=e.entrypoint_signature))then raise exception 'evaluation context evaluator identity is absent, undeployed, or cross-firm'using errcode='CLR11';end if;
  select producer_version_id,dataset_sha256,books_watermark into s from clara.metric_input_snapshots where id=new.snapshot_id and firm_id=new.firm_id and client_id=new.client_id;
  select array_agg(period_id order by ordinal)into p from clara.metric_evaluation_context_periods where context_id=new.id;
  if s.dataset_sha256 is null or p is null or new.context_sha256<>clara._metric_context_sha256_v1(new.snapshot_id,p,new.firm_id,new.client_id,s.producer_version_id,new.evaluator_version_id,s.dataset_sha256,s.books_watermark)then raise exception 'evaluation context hash does not reconstruct'using errcode='CLR11';end if;return new;
end $context$;
revoke all on function clara._tf_metric_context_integrity() from public;
create constraint trigger t_metric_context_integrity after insert or update on clara.metric_evaluation_contexts deferrable initially deferred for each row execute function clara._tf_metric_context_integrity();

-- Scalar cell provenance must agree with the context, snapshot, evaluator and optional definition.
create function clara._tf_metric_cell_integrity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $cell$
declare c record; d record; z jsonb; na jsonb; expected_inputs jsonb; expected_reason uuid; edge_id uuid; average_id uuid; average_key text; v clara.metric_value_v1; root_period uuid; root_start date; periods uuid[]; factor numeric; q numeric; rem numeric; shown text;
begin
  select ec.evaluator_version_id,ec.run_id,ec.snapshot_id,s.books_watermark into c
    from clara.metric_evaluation_contexts ec join clara.metric_input_snapshots s on s.id=ec.snapshot_id
    where ec.id=new.evaluation_context_id and ec.firm_id=new.firm_id and ec.client_id=new.client_id;
  if not found or c.evaluator_version_id<>new.evaluator_version_id or c.run_id<>new.run_id or c.books_watermark<>new.books_watermark then
    raise exception 'cell context/evaluator/run/books-watermark binding is false' using errcode='CLR11';end if;
  if new.model_proposal_id is not null or new.human_approval_id is not null or new.supersedes_cell_id is not null
     or new.model_proposal_provenance is distinct from '{"kind":"not_applicable","version":1,"reason":"evaluator_originated"}'::jsonb
     or new.human_approval_provenance is distinct from '{"kind":"not_applicable","version":1,"reason":"no_numeric_approval"}'::jsonb then
    raise exception 'cell proposal, approval, or supersession provenance is not exact v1 evaluator provenance'using errcode='CLR11';end if;
  if new.definition_version_id is null then
    z:=new.inputs->'composition';
    if new.inputs->>'schema' is distinct from 'clara.metric-composition-inputs/v1' or jsonb_typeof(z) is distinct from 'object'
       or z->>'evaluator_entrypoint' is distinct from 'clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)' or z#>'{ast,root}' is distinct from clara._normalize_metric_node_v1(z#>'{ast,root}')
       or clara._hash(z) is distinct from new.formula_sha256 or(case z#>>'{ast,unit}' when'currency'then'money'else z#>>'{ast,unit}'end) is distinct from new.unit_key or(new.cell_status='ok'and(z#>>'{ast,result_scale}')::smallint is distinct from new.displayed_scale)then
      raise exception 'cell lacks a definition and a hash-bound typed composition path' using errcode='CLR11';
    end if;
    perform clara.validate_metric_ast_v1(z->'ast');average_key:=coalesce(z->>'averaging_policy','avg_month_end_v1');select id into edge_id from clara.edge_policy_sets where policy_set_key=z#>>'{ast,edge_policy_set}'and(firm_id is null or firm_id=new.firm_id)order by firm_id nulls last,version desc limit 1;select id into average_id from clara.averaging_policy_versions where policy_key=average_key and(firm_id is null or firm_id=new.firm_id)and implemented order by firm_id nulls last,version desc limit 1;select array_agg(period_id order by ordinal)into periods from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id;root_period:=periods[1];if edge_id is null or average_id is null or root_period is null then raise exception 'composition policies or root period are absent'using errcode='CLR11';end if;
    v:=clara._metric_eval_node_v1(new.client_id,c.snapshot_id,new.evaluation_context_id,root_period,z#>'{ast,root}',coalesce((z->>'allow_negative')::boolean,false),average_key,null);
    if new.resolved_inputs_sha256<>clara._metric_resolved_inputs_sha256_v1((select context_sha256 from clara.metric_evaluation_contexts where id=new.evaluation_context_id),periods,new.firm_id,new.client_id,null,new.formula_sha256,v.account_set_version_ids,v.constant_version_ids,edge_id,average_id,new.evaluator_version_id,new.books_watermark)then raise exception 'composition resolved inputs hash does not reconstruct'using errcode='CLR11';end if;
    if v.status='ok'then factor:=power(10::numeric,(z#>>'{ast,result_scale}')::smallint);q:=div(abs(v.numerator)*factor,v.denominator);rem:=mod(abs(v.numerator)*factor,v.denominator);if rem*2>=v.denominator then q:=q+1;end if;shown:=to_char((case when v.numerator<0 then-q else q end)/factor,'FM999999999999999999999999999999999999999999999999990'||case when(z#>>'{ast,result_scale}')::smallint>0 then'.'||repeat('0',(z#>>'{ast,result_scale}')::smallint)else''end);end if;
    if v.status<>new.cell_status or v.reason_key is distinct from(select reason_key from clara.metric_na_reason_versions where id=new.na_reason_version_id) or(case when v.status='ok'then v.numerator end)is distinct from new.exact_numerator or(case when v.status='ok'then v.denominator end)is distinct from new.exact_denominator or shown is distinct from new.displayed_text then
      raise exception 'composition cell is not its deterministic evaluator result' using errcode='CLR11';end if;
  else
    select dv.firm_id,dv.formula_sha256,dv.unit_key,dv.result_scale,dv.ast,dv.allow_negative,dv.edge_policy_set_id,dv.averaging_policy_id,ap.policy_key into d from clara.metric_definition_versions dv join clara.metric_definitions md on md.id=dv.definition_id join clara.averaging_policy_versions ap on ap.id=dv.averaging_policy_id where dv.id=new.definition_version_id and md.firm_id is not distinct from dv.firm_id and dv.state in('firm_approved','canonical')and dv.approved_formula_sha256=dv.formula_sha256;
    if not found or(d.firm_id is not null and d.firm_id is distinct from new.firm_id)or d.formula_sha256<>new.formula_sha256 or d.unit_key<>new.unit_key or(new.cell_status='ok'and d.result_scale<>new.displayed_scale)then raise exception 'cell definition identity/lifecycle/hash/unit/result-scale binding is false'using errcode='CLR11';end if;
    select array_agg(period_id order by ordinal)into periods from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id;root_period:=periods[1];v:=clara._metric_eval_node_v1(new.client_id,c.snapshot_id,new.evaluation_context_id,root_period,d.ast->'root',d.allow_negative,d.policy_key,null);
    if root_period is null or new.resolved_inputs_sha256<>clara._metric_resolved_inputs_sha256_v1((select context_sha256 from clara.metric_evaluation_contexts where id=new.evaluation_context_id),periods,new.firm_id,new.client_id,new.definition_version_id,new.formula_sha256,v.account_set_version_ids,v.constant_version_ids,d.edge_policy_set_id,d.averaging_policy_id,new.evaluator_version_id,new.books_watermark)then raise exception 'cell resolved inputs hash does not reconstruct'using errcode='CLR11';end if;
    if v.status='ok'then factor:=power(10::numeric,d.result_scale);q:=div(abs(v.numerator)*factor,v.denominator);rem:=mod(abs(v.numerator)*factor,v.denominator);if rem*2>=v.denominator then q:=q+1;end if;shown:=to_char((case when v.numerator<0 then-q else q end)/factor,'FM999999999999999999999999999999999999999999999999990'||case when d.result_scale>0 then'.'||repeat('0',d.result_scale)else''end);end if;
    if v.status<>new.cell_status or v.reason_key is distinct from(select reason_key from clara.metric_na_reason_versions where id=new.na_reason_version_id)or(case when v.status='ok'then v.numerator end)is distinct from new.exact_numerator or(case when v.status='ok'then v.denominator end)is distinct from new.exact_denominator or shown is distinct from new.displayed_text then raise exception 'cell is not its deterministic evaluator result'using errcode='CLR11';end if;
  end if;
  if new.cell_status='ok' then if new.na_reason_version_id is not null or new.exact_numerator is null or new.exact_denominator is null or new.exact_denominator<=0 then raise exception 'an ok cell has malformed exact value or N/A reason' using errcode='CLR10'; end if;
  else
    /* i3: the N/A wording is resolved PERIOD-EFFECTIVELY against the ROOT reporting period's period_start -- the same anchor evaluate_metric_v1 uses, and the same idiom as account-set version and pack definition admission -- with the highest version breaking a co-effective tie. Wall and writer therefore cannot select different wording for the same cell. */
    select period_start into root_start from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id and period_id=root_period;if root_start is null then raise exception 'cell N/A reason has no root reporting period to resolve against'using errcode='CLR11';end if;
    select id into expected_reason from clara.metric_na_reason_versions where firm_id is null and reason_key=v.reason_key and effective_from<=root_start and(effective_to is null or effective_to>=root_start)order by version desc limit 1;
    if expected_reason is null or new.na_reason_version_id is distinct from expected_reason then raise exception 'cell N/A reason version is not the exact period-effective evaluator-selected version'using errcode='CLR10';end if;
  end if;
  na:=jsonb_build_object('presentation_map_versions',jsonb_build_object('version',1,'reason','definition_has_no_presentation_map_binding'),'model_proposal',jsonb_build_object('version',1,'reason','evaluator_originated'),'human_approval',jsonb_build_object('version',1,'reason','no_numeric_approval'),'supersession',jsonb_build_object('version',1,'reason','first_mint'));
  if cardinality(v.document_ids)=0 then na:=na||jsonb_build_object('documents',jsonb_build_object('version',1,'reason','no_document-backed_input_rows'));end if;
  expected_inputs:=coalesce(v.inputs,'{}')||jsonb_build_object('normalized_provenance',jsonb_build_object('period_ids',periods,'snapshot_ids',array[c.snapshot_id],'account_set_version_ids',array(select x from unnest(v.account_set_version_ids)x order by x),'constant_version_ids',array(select x from unnest(v.constant_version_ids)x order by x),'entry_ids',array(select x from unnest(v.entry_ids)x order by x),'document_ids',array(select x from unnest(v.document_ids)x order by x),'presentation_map_version_ids','{}'::uuid[]),'schema',case when new.definition_version_id is null then'clara.metric-composition-inputs/v1'else'clara.metric-cell-inputs/v1'end,'provenance_not_applicable',na);
  if new.definition_version_id is null then expected_inputs:=expected_inputs||jsonb_build_object('composition',z);end if;
  if new.inputs is distinct from expected_inputs then raise exception 'cell inputs/provenance are not the exact evaluator result'using errcode='CLR11';end if;
  return new;
end $cell$;
revoke all on function clara._tf_metric_cell_integrity() from public;
create constraint trigger t_metric_cell_integrity after insert or update
  on clara.metric_cells deferrable initially immediate for each row
  execute function clara._tf_metric_cell_integrity();

-- Normalized period and snapshot rows may cite only actual members of the cell context.
create function clara._tf_metric_cell_context_member() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $member$
declare c record;
begin
  select evaluation_context_id,firm_id,client_id into c from clara.metric_cells where id=new.cell_id;
  if not found or c.firm_id<>new.firm_id or c.client_id<>new.client_id then
    raise exception 'cell context member is absent or cross-tenant' using errcode='CLR11'; end if;
  if tg_table_name='metric_cell_periods' then
    if not exists(select 1 from clara.metric_evaluation_context_periods p
        where p.context_id=c.evaluation_context_id and p.period_id=new.period_id
          and p.firm_id=new.firm_id and p.client_id=new.client_id
          and p.period_start=new.period_start and p.period_end=new.period_end) then
      raise exception 'cell period is not a member of its evaluation context' using errcode='CLR11'; end if;
  elsif tg_table_name='metric_cell_snapshots' then
    if not exists(select 1 from clara.metric_evaluation_contexts ec
        where ec.id=c.evaluation_context_id and ec.snapshot_id=new.snapshot_id
          and ec.firm_id=new.firm_id and ec.client_id=new.client_id) then
      raise exception 'cell snapshot is not its evaluation-context snapshot' using errcode='CLR11'; end if;
  else raise exception 'unsupported cell-context member target %',tg_table_name using errcode='CLR10';
  end if;
  return new;
end $member$;
revoke all on function clara._tf_metric_cell_context_member() from public;
create constraint trigger t_metric_cell_period_context after insert or update
  on clara.metric_cell_periods deferrable initially immediate for each row
  execute function clara._tf_metric_cell_context_member();
create constraint trigger t_metric_cell_snapshot_context after insert or update
  on clara.metric_cell_snapshots deferrable initially immediate for each row
  execute function clara._tf_metric_cell_context_member();

-- An assessment has a closed observed-value shape and a positively identified independent evaluator.
create function clara._tf_metric_assessment_integrity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $assessment$
declare c record; e record;
begin
  select evaluator_version_id into c from clara.metric_cells where id=new.cell_id
    and firm_id=new.firm_id and client_id=new.client_id;
  if not found then raise exception 'assessment cell is absent or cross-tenant' using errcode='CLR11'; end if;
  select firm_id,evaluator_name,entrypoint_signature,deployed into e
    from clara.evaluator_versions where id=new.evaluator_version_id;
  if not found or not e.deployed or new.evaluator_version_id=c.evaluator_version_id
     or e.evaluator_name<>'assess_metric_cell_independent'
     or e.entrypoint_signature<>'clara.assess_metric_cell_independent_v1(uuid,uuid,text)'
     or (e.firm_id is not null and e.firm_id is distinct from new.firm_id)
     or not exists(select 1 from clara.evaluator_version_members m
       where m.evaluator_version_id=new.evaluator_version_id
         and m.member_signature='clara.assess_metric_cell_independent_v1(uuid,uuid,text)') then
    raise exception 'assessment evaluator is not the deployed independent evaluator identity' using errcode='CLR11';
  end if;
  if new.observed_status='ok' then
    if new.observed_reason_key is not null or new.observed_numerator is null
       or new.observed_denominator is null or new.observed_denominator<=0 or new.observed_numerator::text in('NaN','Infinity','-Infinity')
       or new.observed_denominator::text in('NaN','Infinity','-Infinity') then
      raise exception 'ok assessment observed value is malformed' using errcode='CLR10'; end if;
  elsif new.observed_status in('undefined','absent','refused') then
    if nullif(btrim(new.observed_reason_key),'') is null or new.observed_numerator is not null
       or new.observed_denominator is not null or not exists(select 1
         from clara.metric_na_reason_versions n where n.reason_key=new.observed_reason_key
           and n.cell_status=new.observed_status
           and (n.firm_id is null or n.firm_id=new.firm_id)) then
      raise exception 'non-ok assessment observed value/reason is malformed' using errcode='CLR10'; end if;
  else raise exception 'assessment observed status is outside the closed set' using errcode='CLR10';
  end if;
  return new;
end $assessment$;
revoke all on function clara._tf_metric_assessment_integrity() from public;
create constraint trigger t_metric_assessment_integrity after insert or update
  on clara.metric_cell_assessments deferrable initially immediate for each row
  execute function clara._tf_metric_assessment_integrity();

-- Behavior births the nine grants. Security owns their exact scoped policies and negative half.
do $agent_catalog$
declare r record; p record; v_nullable boolean;
begin
  for r in select * from _delta_security_roster where agent_catalog loop
    for p in select policyname from pg_policies where schemaname='clara'
        and tablename=r.table_name and 'clara_agent_ro'=any(roles) loop
      execute format('drop policy %I on clara.%I',p.policyname,r.table_name);
    end loop;
    select is_nullable='YES' into v_nullable from information_schema.columns
      where table_schema='clara' and table_name=r.table_name and column_name='firm_id';
    execute format('create policy p_delta_agent_catalog on clara.%I for select to clara_agent_ro using (%s)',
      r.table_name,case when v_nullable then 'firm_id is null or firm_id=clara.wake_firm()'
        else 'firm_id=clara.wake_firm()' end);
  end loop;
  for r in select * from _delta_security_roster where not agent_catalog loop
    execute format('revoke select on clara.%I from clara_agent_ro',r.table_name);
  end loop;
end $agent_catalog$;

reset role;

do $tail$
declare r record; p record; v_rls int:=0; v_policies int:=0; v_append int:=0;
  v_lifecycle int:=0; v_truncate int:=0; v_refs int; v_docs int; v_additive int:=0;
  v_congruence int:=0; v_agent int:=0; v_bad int; v_scoped_writers int; v_role text; v_sig text;
  v_nullable boolean; v_qual text;
  v_entrypoints text[]:=array[
    'clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)',
    'clara.propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara.approve_metric_definition(uuid,bytea,text,text,text)',
    'clara.reject_metric_definition(uuid,text,text)',
    'clara.supersede_metric_definition(uuid,uuid,text,text)',
    'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)',
    'clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)',
    'clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)',
    'clara.assess_metric_cell_independent_v1(uuid,uuid,text)',
    'clara.record_metric_evaluation_attempt_v1(uuid,uuid,text,text,uuid[],text,text,jsonb)',
    'clara.verify_evaluator_freeze()'];
begin
  perform clara.verify_metric_input_producer_freeze();perform clara.verify_account_set_version_freeze(id)from clara.account_set_versions;
  if (select count(*) from clara.metric_input_producer_versions)<>1
     or (select count(*) from clara.metric_input_producer_version_members)<>15 then
    raise exception 'delta security tail: producer closure registry is incomplete' using errcode='CLR10';
  end if;
  if current_user<>(select v from _delta_security_meta where k='deploy_user')
     or current_role<>(select v from _delta_security_meta where k='deploy_role') then
    raise exception 'delta security tail: deploy principal was not restored (user %, role %)',current_user,current_role using errcode='CLR10';
  end if;
  if has_table_privilege('clara_fn_owner','clara.evaluator_versions','update') is not true then
    raise exception 'delta security tail: clara_fn_owner lacks evaluator deployment UPDATE' using errcode='CLR10';
  end if;
  -- deploy_user is the pre-SET ROLE effective principal; this probe includes inherited role privileges.
  if has_table_privilege((select v from _delta_security_meta where k='deploy_user'),
      'clara.evaluator_versions','update') is not true then
    raise exception 'delta security tail: captured deploy principal lacks effective evaluator deployment UPDATE' using errcode='CLR10';
  end if;
  for r in select * from _delta_security_roster loop
    if exists(select 1 from pg_class where oid=('clara.'||r.table_name)::regclass
        and relrowsecurity and relforcerowsecurity) then v_rls:=v_rls+1; end if;
    if exists(select 1 from pg_policies where schemaname='clara' and tablename=r.table_name
        and cmd='ALL' and 'clara_fn_owner'=any(roles))
       and exists(select 1 from pg_policies where schemaname='clara' and tablename=r.table_name
        and cmd='SELECT' and 'clara_authenticated'=any(roles)) then v_policies:=v_policies+1; end if;
    if exists(select 1 from pg_trigger where tgrelid=('clara.'||r.table_name)::regclass
        and tgfoid='clara._tf_append_only()'::regprocedure and not tgisinternal) then v_append:=v_append+1; end if;
    if exists(select 1 from pg_trigger t
        where t.tgrelid=('clara.'||r.table_name)::regclass and not t.tgisinternal
          and t.tgfoid in('clara._tf_metric_definition_lifecycle_v1()'::regprocedure,
            'clara._tf_account_set_version_lifecycle()'::regprocedure,'clara._tf_evaluator_deploy_once()'::regprocedure)) then v_lifecycle:=v_lifecycle+1; end if;
    if exists(select 1 from pg_trigger where tgrelid=('clara.'||r.table_name)::regclass
        and tgfoid='clara._tf_no_truncate()'::regprocedure and not tgisinternal) then v_truncate:=v_truncate+1; end if;
    if not has_table_privilege('clara_authenticated','clara.'||r.table_name,'select')
       or has_table_privilege('clara_authenticated','clara.'||r.table_name,'insert,update,delete,truncate') then
      raise exception 'delta security tail: authenticated ACL wrong on clara.%',r.table_name using errcode='CLR10'; end if;
    foreach v_role in array array['clara_agent_ro','clara_runtime','clara_wake_interactive','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_table_privilege(v_role,'clara.'||r.table_name,'insert,update,delete,truncate') then
        raise exception 'delta security tail: % has DML on clara.%',v_role,r.table_name using errcode='CLR10'; end if;
    end loop;
    if has_table_privilege('clara_agent_ro','clara.'||r.table_name,'select') then
      if not r.agent_catalog then raise exception 'delta security tail: agent raw SELECT on clara.%',r.table_name using errcode='CLR10'; end if;
      v_agent:=v_agent+1;
      select is_nullable='YES' into v_nullable from information_schema.columns
        where table_schema='clara' and table_name=r.table_name and column_name='firm_id';
      select qual into v_qual from pg_policies where schemaname='clara' and tablename=r.table_name
        and policyname='p_delta_agent_catalog' and 'clara_agent_ro'=any(roles);
      if v_qual is null or v_qual !~* 'wake_firm' or (v_nullable and v_qual !~* 'firm_id IS NULL')
         or (not v_nullable and v_qual ~* 'firm_id IS NULL') then
        raise exception 'delta security tail: agent policy scope wrong on clara.%: %',r.table_name,v_qual using errcode='CLR10'; end if;
    elsif r.agent_catalog then
      raise exception 'delta security tail: agent catalog SELECT absent on clara.%',r.table_name using errcode='CLR10';
    end if;
  end loop;
  if to_regrole('clara_runtime_login') is not null then
    for r in select * from _delta_security_roster loop
      if has_table_privilege('clara_runtime_login','clara.'||r.table_name,'insert,update,delete,truncate') then
        raise exception 'delta security tail: runtime login has DML on clara.%',r.table_name using errcode='CLR10'; end if;
    end loop;
  end if;
  foreach v_sig in array v_entrypoints loop
    if to_regprocedure(v_sig) is null or not exists(select 1 from pg_proc f where f.oid=v_sig::regprocedure
        and f.prosecdef and (f.proconfig @> array['search_path=clara, pg_temp']
          or (v_sig='clara.verify_evaluator_freeze()'
            and f.proconfig @> array['search_path=pg_catalog, pg_temp'])))
       or not has_function_privilege('clara_authenticated',v_sig,'execute') then
      raise exception 'delta security tail: writer/read posture wrong for %',v_sig using errcode='CLR10'; end if;
    if exists(select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a where f.oid=v_sig::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'delta security tail: PUBLIC executes %',v_sig using errcode='CLR10'; end if;
    -- The two NON-INHERITING login shells are named explicitly: a group-only probe cannot answer for clara_agent_read_login (0006) or clara_wake_write_login (0009).
    foreach v_role in array array['clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_interactive','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role,v_sig,'execute') then
        raise exception 'delta security tail: % executes %',v_role,v_sig using errcode='CLR10'; end if;
    end loop;
  end loop;
  select count(*) into v_bad from pg_proc f cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_interactive','clara_wake_proactive'])app(rolname) join pg_roles g on g.rolname=app.rolname where f.pronamespace='clara'::regnamespace and has_function_privilege(g.oid,f.oid,'EXECUTE')and lower(f.prosrc)~'(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_units|metric_temporalities|metric_primitives|metric_na_reason_versions|metric_constants|edge_policy_sets|metric_edge_policies|averaging_policy_versions)\M';
  select count(*) into v_scoped_writers from pg_proc f cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_interactive','clara_wake_proactive'])app(rolname) join pg_roles g on g.rolname=app.rolname where f.pronamespace='clara'::regnamespace and has_function_privilege(g.oid,f.oid,'EXECUTE')and lower(f.prosrc)~'(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_scoped_writers<>4
     or exists(select 1 from(values('clara.propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)'),('clara.approve_metric_definition(uuid,bytea,text,text,text)'),('clara.reject_metric_definition(uuid,text,text)'),('clara.supersede_metric_definition(uuid,uuid,text,text)'))x(sig) cross join lateral aclexplode(coalesce((select proacl from pg_proc where oid=x.sig::regprocedure),acldefault('f',(select proowner from pg_proc where oid=x.sig::regprocedure))))a left join pg_roles g on g.oid=a.grantee where a.privilege_type='EXECUTE'and a.grantee<>(select proowner from pg_proc where oid=x.sig::regprocedure)and(a.grantee=0 or g.rolname is distinct from'clara_authenticated'or a.is_grantable))
     or not exists(select 1 from pg_proc f where f.oid='clara.propose_metric_definition(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)'::regprocedure and sha256(convert_to(f.prosrc,'UTF8'))='\x446e78387e7fa3d7fb716bafbcd52cde080a064fe0481632bd6480c661f1d994'::bytea)
     or not exists(select 1 from pg_proc f where f.oid='clara.approve_metric_definition(uuid,bytea,text,text,text)'::regprocedure and sha256(convert_to(f.prosrc,'UTF8'))='\x494c5a92cb1114a1b89310ea44f6830172c8a25d9e23d722f94b58c3e94a1028'::bytea)
     or not exists(select 1 from pg_proc f where f.oid='clara.reject_metric_definition(uuid,text,text)'::regprocedure and sha256(convert_to(f.prosrc,'UTF8'))='\x4ffec6c0d7526d063f710b13395c743d7ddbade977d1b1b96ee02943f232e35b'::bytea)
     or not exists(select 1 from pg_proc f where f.oid='clara.supersede_metric_definition(uuid,uuid,text,text)'::regprocedure and sha256(convert_to(f.prosrc,'UTF8'))='\x204ce22f2653aa657d8bb835c3a2d24be947a03f69fad97274bb518165089222'::bytea)
  then raise exception 'delta security tail: metric writer proof %, expected four exact firm-scoped audited lifecycle bodies',v_scoped_writers using errcode='CLR10';end if;
  select count(*) into v_refs from pg_trigger where not tgisinternal
    and tgfoid='clara._tf_metric_catalog_scope()'::regprocedure;
  select count(*) into v_docs from pg_trigger where not tgisinternal
    and tgfoid='clara._tf_metric_document_binding()'::regprocedure;
  select count(*) into v_additive from(values
    ('t_metric_open_item_identity','clara.metric_input_snapshot_open_items'::regclass,'clara._tf_metric_snapshot_fact_identity()'::regprocedure),('t_metric_allocation_identity','clara.metric_input_snapshot_allocations'::regclass,'clara._tf_metric_snapshot_fact_identity()'::regprocedure),('t_metric_sample_identity','clara.metric_input_snapshot_samples'::regclass,'clara._tf_metric_snapshot_fact_identity()'::regprocedure),('t_metric_contribution_identity','clara.metric_input_snapshot_contributions'::regclass,'clara._tf_metric_contribution_identity()'::regprocedure),('t_metric_cell_document_snapshot','clara.metric_cell_documents'::regclass,'clara._tf_metric_cell_document_snapshot()'::regprocedure),('t_metric_definition_supersedes_identity','clara.metric_definition_versions'::regclass,'clara._tf_metric_definition_supersedes_identity()'::regprocedure))e(n,r,f)
    join pg_trigger t on t.tgname=e.n and t.tgrelid=e.r and t.tgfoid=e.f where not t.tgisinternal and t.tgdeferrable and not t.tginitdeferred;
  select count(*) into v_congruence from(values
    ('t_metric_context_integrity','clara.metric_evaluation_contexts'::regclass,'clara._tf_metric_context_integrity()'::regprocedure),('t_metric_cell_integrity','clara.metric_cells'::regclass,'clara._tf_metric_cell_integrity()'::regprocedure),('t_metric_cell_period_context','clara.metric_cell_periods'::regclass,'clara._tf_metric_cell_context_member()'::regprocedure),('t_metric_cell_snapshot_context','clara.metric_cell_snapshots'::regclass,'clara._tf_metric_cell_context_member()'::regprocedure),('t_metric_assessment_integrity','clara.metric_cell_assessments'::regclass,'clara._tf_metric_assessment_integrity()'::regprocedure))e(n,r,f)
    join pg_trigger t on t.tgname=e.n and t.tgrelid=e.r and t.tgfoid=e.f where not t.tgisinternal and t.tgdeferrable and(t.tgname='t_metric_context_integrity')=t.tginitdeferred;
  if v_rls<>38 or v_policies<>38 or v_append<>35 or v_lifecycle<>3 or v_truncate<>38
     or v_refs<>22 or v_docs<>2 or v_additive<>6 or v_congruence<>5 or v_agent<>9 or v_bad<>0 then
    raise exception 'delta security tail: RLS % policies % append % lifecycle % truncate % refs % docs % additive % congruence % agent % curated writers %',
      v_rls,v_policies,v_append,v_lifecycle,v_truncate,v_refs,v_docs,v_additive,v_congruence,v_agent,v_bad using errcode='CLR10';
  end if;
  raise notice 'delta security OK: forced RLS/policies 38/38; immutable coverage 35 append + 3 lifecycle; no-TRUNCATE 38; retained base guards 22 catalog + 2 document; account-set freeze verifier/sealing retained; producer closure 1/15; additive source/provenance 6; congruence 5; agent catalog 9/raw 0; application DML 0; curated-writer app grants 0; 11 authenticated-only pinned entrypoints incl. the immutable A30b attempt-receipt writer.';
end $tail$;
