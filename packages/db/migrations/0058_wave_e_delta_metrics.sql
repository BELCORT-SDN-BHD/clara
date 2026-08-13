-- 0058_wave_e_delta_metrics.sql -- Wave E lane delta schema + primitive source.
-- Number is claimed at merge. Add-only: 0057 is not recut; no epsilon report/render objects.
-- The timeout is load-bearing for the one existing-chart UUID backfill.
set local statement_timeout = '20min';
create temp table _delta_pre(k text primary key, v text not null) on commit drop; insert into _delta_pre values('deploy_principal',session_user);
do $pre$
declare n text; b text;
begin
  if not exists(select 1 from clara.schema_migrations where version='0057_wave_e_registry_snapshots') then
    raise exception 'delta requires 0057' using errcode='CLR10';
  end if;
  foreach n in array array[
    'metric_input_producer_versions','metric_input_producer_version_members','metric_input_snapshots','metric_input_snapshot_periods',
    'metric_input_snapshot_contributions','metric_input_snapshot_open_items',
    'metric_input_snapshot_allocations','metric_input_snapshot_samples','metric_units',
    'metric_temporalities','metric_primitives','metric_na_reason_versions','metric_constants',
    'edge_policy_sets','metric_edge_policies','averaging_policy_versions','account_sets',
    'account_set_versions','account_set_version_members','presentation_maps',
    'presentation_map_versions','presentation_map_version_members','metric_definitions',
    'metric_definition_versions','evaluator_versions','evaluator_version_members',
    'metric_evaluation_contexts','metric_evaluation_context_periods','metric_cells',
    'metric_cell_periods','metric_cell_snapshots','metric_cell_account_sets',
    'metric_cell_constants','metric_cell_entries','metric_cell_documents',
    'metric_cell_presentation_maps','metric_cell_assessments','metric_evaluation_attempt_receipts'
  ] loop
    if to_regclass('clara.'||n) is not null then
      raise exception 'delta partial birth: clara.% already exists',n using errcode='CLR10';
    end if;
  end loop;
  if exists(select 1 from information_schema.columns where table_schema='clara' and table_name='coa_accounts' and column_name='account_id') then
    raise exception 'delta partial birth: coa account_id already exists' using errcode='CLR10';
  end if;
  foreach n in array array[
    'clara._hash(jsonb)','clara._human_ctx(integer)','clara.role_rank(text)',
    'clara._reserve_op(uuid,text,text,bytea)','clara._finish_op(uuid,text,text,jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)','clara._tf_append_only()',
    'clara._tf_no_truncate()','clara._days_in_period_core(uuid)'
  ] loop
    if to_regprocedure(n) is null then raise exception 'delta helper absent: %',n using errcode='CLR10'; end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='clara.reporting_periods'::regclass and conname='uq_rp_identity') then
    raise exception 'delta requires the five-column reporting-period identity' using errcode='CLR10';
  end if;
  select coalesce(string_agg(p.oid::regprocedure::text||':'||md5(p.prosrc),E'\n' order by 1),'(none)') into b
    from pg_proc p where p.pronamespace='clara'::regnamespace
      and lower(coalesce(p.prosrc,'')) ~ '(insert\s+into|update)\s+clara\.coa_accounts\M';
  insert into _delta_pre values('coa_writers',b);
end $pre$;
set role clara_fn_owner;
alter table clara.coa_accounts add column account_id uuid;
update clara.coa_accounts set account_id=gen_random_uuid();
alter table clara.coa_accounts
  alter column account_id set default gen_random_uuid(),
  alter column account_id set not null,
  add constraint uq_coa_account_id unique(account_id),
  add constraint uq_coa_account_id_tenant unique(account_id,firm_id,client_id),
  add constraint fk_coa_client_firm_delta foreign key(client_id,firm_id) references clara.clients(id,firm_id);
create function clara._tf_coa_account_id_immutable() returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$begin if new.account_id is distinct from old.account_id then raise exception 'coa account_id is immutable' using errcode='CLR08';end if;return new;end$$;
revoke all on function clara._tf_coa_account_id_immutable() from public;create trigger t_coa_account_id_immutable before update on clara.coa_accounts for each row execute function clara._tf_coa_account_id_immutable();
create table clara.metric_units(
  unit_key text primary key check(unit_key in('money','ratio','days','count')),
  firm_id uuid references clara.firms(id), currency_power smallint not null,
  days_power smallint not null, count_power smallint not null, created_at timestamptz not null default now());
create table clara.metric_temporalities(
  temporality_key text primary key check(temporality_key in('point_in_time','flow','period_average')),
  firm_id uuid references clara.firms(id), created_at timestamptz not null default now());
create table clara.metric_primitives(
  primitive_key text primary key check(primitive_key in('measure','sum','average','lag','subtract','divide','days_in_period','percent_change','multiply','constant','count')),
  firm_id uuid references clara.firms(id), structural_integer_fields text[] not null default '{}', created_at timestamptz not null default now());
create table clara.metric_na_reason_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), reason_key text not null,
  version int not null check(version>0), cell_status text not null check(cell_status in('undefined','absent','refused')),
  display_token text not null, semantics jsonb not null check(jsonb_typeof(semantics)='object'),
  effective_from date not null, effective_to date, created_at timestamptz not null default now(),
  unique nulls not distinct(firm_id,reason_key,version), check(effective_to is null or effective_to>=effective_from));
create table clara.metric_constants(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), constant_key text not null,
  version int not null check(version>0), numerator numeric not null,
  denominator numeric not null,
  currency_power smallint not null default 0, days_power smallint not null default 0, count_power smallint not null default 0,
  effective_from date not null, effective_to date, source_note text not null check(btrim(source_note)<>''),
  created_at timestamptz not null default now(), unique nulls not distinct(firm_id,constant_key,version),
  constraint ck_metric_constants_numerator_finite_integer
    check(numerator::text not in('NaN','Infinity','-Infinity') and numerator=trunc(numerator)),
  constraint ck_metric_constants_denominator_finite_positive_integer
    check(denominator::text not in('NaN','Infinity','-Infinity') and denominator>0 and denominator=trunc(denominator)),
  check(effective_to is null or effective_to>=effective_from));
create table clara.edge_policy_sets(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), policy_set_key text not null,
  version int not null check(version>0), effective_from date not null, effective_to date,
  content_sha256 bytea not null check(octet_length(content_sha256)=32), created_at timestamptz not null default now(),
  unique nulls not distinct(firm_id,policy_set_key,version));
create table clara.metric_edge_policies(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id),
  policy_set_id uuid not null references clara.edge_policy_sets(id),
  policy_class text not null check(policy_class in('division_by_zero','negative_denominator','missing_data','sign_normalization','rounding')),
  policy_key text not null, semantics jsonb not null check(jsonb_typeof(semantics)='object'),
  created_at timestamptz not null default now(), unique(policy_set_id,policy_class));
create table clara.averaging_policy_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), policy_key text not null,
  version int not null check(version>0), semantics jsonb not null check(jsonb_typeof(semantics)='object'),
  effective_from date not null, effective_to date, implemented boolean not null default true,
  created_at timestamptz not null default now(), unique nulls not distinct(firm_id,policy_key,version));
create table clara.account_sets(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  set_key text not null, title text not null, created_by uuid not null references clara.users(id), created_at timestamptz not null default now(),
  foreign key(client_id,firm_id) references clara.clients(id,firm_id), unique(id,firm_id,client_id), unique(client_id,set_key));
create table clara.account_set_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  account_set_id uuid not null, revision int not null check(revision>0), selector jsonb not null check(jsonb_typeof(selector)='object'),
  zero_when_no_rows boolean not null default false, frozen_member_count int not null check(frozen_member_count>=0),
  frozen_members_sha256 bytea not null check(octet_length(frozen_members_sha256)=32),
  content_sha256 bytea not null check(octet_length(content_sha256)=32), state text not null check(state in('published','superseded')),
  effective_from date not null, effective_to date, created_xid xid8 not null default pg_current_xact_id(), created_by uuid not null references clara.users(id), created_at timestamptz not null default now(),
  foreign key(account_set_id,firm_id,client_id) references clara.account_sets(id,firm_id,client_id), unique(id,firm_id,client_id), unique(account_set_id,revision), check(not zero_when_no_rows or frozen_member_count>0), check((state='published'and effective_to is null)or(state='superseded'and effective_to>=effective_from)));
create unique index uq_account_set_versions_current on clara.account_set_versions(account_set_id)where state='published';
create table clara.account_set_version_members(
  account_set_version_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  account_id uuid not null, ordinal int not null check(ordinal>=0), primary key(account_set_version_id,account_id),
  unique(account_set_version_id,ordinal), foreign key(account_set_version_id,firm_id,client_id) references clara.account_set_versions(id,firm_id,client_id),
  foreign key(account_id,firm_id,client_id) references clara.coa_accounts(account_id,firm_id,client_id));
create table clara.presentation_maps(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), map_key text not null,
  title text not null, created_at timestamptz not null default now(), unique nulls not distinct(firm_id,map_key));
create table clara.presentation_map_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id),
  presentation_map_id uuid not null references clara.presentation_maps(id), revision int not null check(revision>0),
  content_sha256 bytea not null check(octet_length(content_sha256)=32), effective_from date not null, effective_to date,
  state text not null check(state in('published','superseded')), created_at timestamptz not null default now(), unique(presentation_map_id,revision));
create table clara.presentation_map_version_members(
  presentation_map_version_id uuid not null references clara.presentation_map_versions(id), firm_id uuid references clara.firms(id),
  line_key text not null, account_set_version_id uuid not null references clara.account_set_versions(id), ordinal int not null check(ordinal>=0),
  primary key(presentation_map_version_id,line_key), unique(presentation_map_version_id,ordinal));
create table clara.metric_definitions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), definition_key text not null,
  title text not null, created_by uuid references clara.users(id), created_at timestamptz not null default now());
create unique index uq_metric_definitions_global on clara.metric_definitions(definition_key) where firm_id is null;
create unique index uq_metric_definitions_firm on clara.metric_definitions(firm_id,definition_key) where firm_id is not null;
create table clara.metric_definition_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id),
  definition_id uuid not null references clara.metric_definitions(id), revision int not null check(revision>0),
  ast jsonb not null check(jsonb_typeof(ast)='object'), normalized_ast jsonb not null check(jsonb_typeof(normalized_ast)='object'),
  formula_sha256 bytea not null check(octet_length(formula_sha256)=32), unit_key text not null references clara.metric_units(unit_key),
  temporality_key text not null references clara.metric_temporalities(temporality_key), result_scale smallint not null,
  edge_policy_set_id uuid not null references clara.edge_policy_sets(id), averaging_policy_id uuid not null references clara.averaging_policy_versions(id),
  allow_negative boolean not null default false, state text not null check(state in('draft','firm_approved','canonical','superseded','rejected')), check(state in('draft','rejected')or result_scale between 0 and 12),
  applies_from date not null, applies_to date, supersedes_version_id uuid references clara.metric_definition_versions(id),
  proposed_by uuid references clara.users(id), proposal_evidence jsonb not null, proposed_at timestamptz not null default now(),
  approved_by uuid references clara.users(id), approved_at timestamptz, approval_reason text, self_approval_attestation text,
  approved_formula_sha256 bytea, approval_evidence jsonb not null,
  unique(definition_id,revision), check(applies_to is null or applies_to>=applies_from),
  check((state in('firm_approved','canonical','superseded'))=(approved_formula_sha256 is not null)),
  check(approved_formula_sha256 is null or approved_formula_sha256=formula_sha256));
create table clara.metric_input_producer_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), producer_name text not null,
  version int not null check(version>0), entrypoint_signature text not null,
  body_sha256 bytea not null check(octet_length(body_sha256)=32), fact_schema text not null,
  created_at timestamptz not null default now(), unique nulls not distinct(firm_id,producer_name,version));
create table clara.metric_input_producer_version_members(
  producer_version_id uuid not null references clara.metric_input_producer_versions(id), firm_id uuid references clara.firms(id),
  ordinal int not null check(ordinal>=0), member_signature text not null check(to_regprocedure(member_signature)is not null),
  body_sha256 bytea not null check(octet_length(body_sha256)=32), primary key(producer_version_id,member_signature), unique(producer_version_id,ordinal));
create table clara.metric_input_snapshots(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  producer_version_id uuid not null references clara.metric_input_producer_versions(id), books_watermark text not null
    check(books_watermark ~ '^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$'),
  dataset_sha256 bytea not null check(octet_length(dataset_sha256)=32), min_period_start date not null, max_period_end date not null,
  contribution_count int not null, open_item_count int not null, allocation_count int not null, sample_count int not null,
  minted_by uuid not null references clara.users(id), minted_at timestamptz not null default now(),
  foreign key(client_id,firm_id) references clara.clients(id,firm_id), unique(id,firm_id,client_id));
create table clara.metric_input_snapshot_periods(
  snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  period_id uuid not null, period_start date not null, period_end date not null, ordinal int not null check(ordinal>=0),
  primary key(snapshot_id,period_id), unique(snapshot_id,ordinal),
  unique(snapshot_id,firm_id,client_id,period_id,period_start,period_end),
  foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  foreign key(period_id,firm_id,client_id,period_start,period_end) references clara.reporting_periods(id,firm_id,client_id,period_start,period_end));
create table clara.metric_input_snapshot_contributions(
  snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  journal_line_id uuid not null references clara.journal_lines(id), entry_id uuid not null, document_id uuid, filing_id uuid,
  account_id uuid not null, bound_period_id uuid, posting_date date not null, account_type text not null,
  account_class text, debit_cents bigint not null, credit_cents bigint not null,
  source_doc_sha256 text check(source_doc_sha256 is null or source_doc_sha256 ~ '^[0-9a-f]{64}$'),
  primary key(snapshot_id,journal_line_id), foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  foreign key(entry_id,firm_id,client_id) references clara.journal_entries(id,firm_id,client_id), foreign key(account_id,firm_id,client_id) references clara.coa_accounts(account_id,firm_id,client_id),
  foreign key(document_id,firm_id) references clara.documents(id,firm_id), constraint fk_metric_snapshot_contribution_filing foreign key(filing_id,firm_id,client_id,document_id) references clara.document_filings(id,firm_id,client_id,document_id),
  check((document_id is null)=(source_doc_sha256 is null) and(document_id is null)=(filing_id is null)), check((debit_cents>0)<>(credit_cents>0)));
create function clara._tf_metric_document_binding() returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$declare e record;begin if tg_relid='clara.metric_input_snapshot_contributions'::regclass then select status,firm_id,client_id,document_id,filing_id,source_doc_sha256 into e from clara.journal_entries where id=new.entry_id;if not found or e.status<>'approved'or e.firm_id<>new.firm_id or e.client_id<>new.client_id or e.document_id is distinct from new.document_id or e.filing_id is distinct from new.filing_id or e.source_doc_sha256 is distinct from new.source_doc_sha256 then raise exception 'metric snapshot filing is not its exact approved entry provenance'using errcode='CLR11';end if;if new.document_id is not null and new.filing_id is distinct from clara._active_document_filing(new.document_id,new.source_doc_sha256,new.client_id,true)then raise exception 'metric snapshot source lacks its exact active verified client filing'using errcode='CLR11';end if;elsif tg_relid='clara.metric_cell_documents'::regclass then if not exists(select 1 from clara.metric_cells mc join clara.metric_evaluation_contexts ec on ec.id=mc.evaluation_context_id and ec.firm_id=mc.firm_id and ec.client_id=mc.client_id join clara.metric_input_snapshot_contributions c on c.snapshot_id=ec.snapshot_id and c.firm_id=ec.firm_id and c.client_id=ec.client_id and c.document_id=new.document_id join clara.document_filings f on f.id=c.filing_id and f.firm_id=c.firm_id and f.client_id=c.client_id and f.document_id=c.document_id where mc.id=new.cell_id and mc.firm_id=new.firm_id and mc.client_id=new.client_id)then raise exception 'metric cell document lacks its evaluation-context snapshot filing evidence'using errcode='CLR11';end if;else raise exception 'metric document guard invocation is not registered'using errcode='CLR10';end if;return new;end$$;
revoke all on function clara._tf_metric_document_binding() from public; create constraint trigger t_metric_document_binding after insert or update on clara.metric_input_snapshot_contributions deferrable initially immediate for each row execute function clara._tf_metric_document_binding();
create table clara.metric_input_snapshot_open_items(
  snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  item_id uuid not null, domain text not null, counterparty_id uuid not null, entry_id uuid not null,
  item_kind text not null, item_date date not null, due_date date, amount_cents bigint not null,
  primary key(snapshot_id,item_id), unique(snapshot_id,item_id,domain,firm_id,client_id),
  foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  foreign key(item_id,firm_id,client_id,domain) references clara.open_items(id,firm_id,client_id,domain));
create table clara.metric_input_snapshot_allocations(
  snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  allocation_id uuid not null, item_id uuid not null, domain text not null, effective_date date not null,
  amount_cents bigint not null, operation_kind text not null, application_group uuid not null,
  primary key(snapshot_id,allocation_id), foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  foreign key(snapshot_id,item_id,domain,firm_id,client_id) references clara.metric_input_snapshot_open_items(snapshot_id,item_id,domain,firm_id,client_id),
  foreign key(allocation_id,firm_id,client_id,domain) references clara.open_item_allocations(id,firm_id,client_id,domain));
create table clara.metric_input_snapshot_samples(
  snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  period_id uuid not null, sample_date date not null, account_id uuid not null, sample_ordinal int not null check(sample_ordinal>=0),
  period_start date not null, period_end date not null, account_code text not null check(account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$'),
  account_type text not null, account_class text, balance_cents bigint not null,
  primary key(snapshot_id,period_id,sample_date,account_id), unique(snapshot_id,sample_ordinal),
  foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  foreign key(period_id,firm_id,client_id,period_start,period_end) references clara.reporting_periods(id,firm_id,client_id,period_start,period_end),
  foreign key(account_id,firm_id,client_id) references clara.coa_accounts(account_id,firm_id,client_id));
create table clara.evaluator_versions(
  id uuid primary key default gen_random_uuid(), firm_id uuid references clara.firms(id), evaluator_name text not null,
  version int not null check(version>0), entrypoint_signature text not null,
  closure_sha256 bytea not null check(octet_length(closure_sha256)=32), migration_version text not null,
  deployed boolean not null default false, created_at timestamptz not null default now(),
  unique nulls not distinct(firm_id,evaluator_name,version));
create table clara.evaluator_version_members(
  evaluator_version_id uuid not null references clara.evaluator_versions(id), firm_id uuid references clara.firms(id),
  ordinal int not null check(ordinal>=0), member_signature text not null,
  body_sha256 bytea not null check(octet_length(body_sha256)=32),
  primary key(evaluator_version_id,member_signature), unique(evaluator_version_id,ordinal));
create table clara.metric_evaluation_contexts(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  snapshot_id uuid not null, evaluator_version_id uuid not null references clara.evaluator_versions(id), run_id uuid not null,
  context_sha256 bytea not null check(octet_length(context_sha256)=32), created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(), foreign key(client_id,firm_id) references clara.clients(id,firm_id),
  foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id),
  -- i1: one run is one immutable context FIRM-WIDE, not merely per client (the scalar and pack entrypoints carry the matching named refusal).
  unique(id,firm_id,client_id), unique(id,snapshot_id,firm_id,client_id), unique(client_id,run_id), constraint uq_metric_evaluation_contexts_firm_run unique(firm_id,run_id));
create table clara.metric_evaluation_context_periods(
  context_id uuid not null, snapshot_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  period_id uuid not null, period_start date not null, period_end date not null, ordinal int not null check(ordinal>=0),
  primary key(context_id,period_id), unique(context_id,ordinal),
  foreign key(context_id,snapshot_id,firm_id,client_id) references clara.metric_evaluation_contexts(id,snapshot_id,firm_id,client_id),
  foreign key(snapshot_id,firm_id,client_id,period_id,period_start,period_end) references clara.metric_input_snapshot_periods(snapshot_id,firm_id,client_id,period_id,period_start,period_end),
  foreign key(period_id,firm_id,client_id,period_start,period_end) references clara.reporting_periods(id,firm_id,client_id,period_start,period_end));
create table clara.metric_cells(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  run_id uuid not null, evaluation_context_id uuid not null, definition_version_id uuid references clara.metric_definition_versions(id),
  formula_sha256 bytea not null check(octet_length(formula_sha256)=32), resolved_inputs_sha256 bytea not null check(octet_length(resolved_inputs_sha256)=32),
  evaluator_version_id uuid not null references clara.evaluator_versions(id), books_watermark text not null
    check(books_watermark ~ '^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$'),
  cell_status text not null check(cell_status in('ok','undefined','absent','refused')),
  na_reason_version_id uuid references clara.metric_na_reason_versions(id), exact_numerator numeric, exact_denominator numeric,
  unit_key text not null references clara.metric_units(unit_key), displayed_scale smallint, displayed_text text,
  inputs jsonb not null check(jsonb_typeof(inputs)='object'),
  model_proposal_id uuid,
  model_proposal_provenance jsonb not null default '{"kind":"not_applicable","version":1,"reason":"authoritative_cells_are_evaluator_originated"}',
  human_approval_id uuid,
  human_approval_provenance jsonb not null default '{"kind":"not_applicable","version":1,"reason":"cell_values_require_no_human_numeric_approval"}',
  supersedes_cell_id uuid references clara.metric_cells(id), created_at timestamptz not null default now(),
  foreign key(client_id,firm_id) references clara.clients(id,firm_id),
  foreign key(evaluation_context_id,firm_id,client_id) references clara.metric_evaluation_contexts(id,firm_id,client_id),
  unique(id,firm_id,client_id), unique(client_id,run_id,definition_version_id),
  check(displayed_scale is null or displayed_scale between 0 and 12),
  check(jsonb_typeof(model_proposal_provenance)='object' and jsonb_typeof(human_approval_provenance)='object'),
  check(model_proposal_id is null and model_proposal_provenance @> '{"kind":"not_applicable","version":1}'::jsonb),
  check(human_approval_id is null and human_approval_provenance @> '{"kind":"not_applicable","version":1}'::jsonb),
  check(coalesce((cell_status='ok' and na_reason_version_id is null and exact_numerator is not null and exact_denominator is not null and exact_denominator>0 and displayed_scale is not null and displayed_text is not null)
     or (cell_status<>'ok' and na_reason_version_id is not null and exact_numerator is null and exact_denominator is null and displayed_scale is null and displayed_text is null),false)),
  constraint ck_metric_cells_exact_numerator_finite check(exact_numerator is null or exact_numerator::text not in('NaN','Infinity','-Infinity')),
  constraint ck_metric_cells_exact_denominator_finite check(exact_denominator is null or exact_denominator::text not in('NaN','Infinity','-Infinity')));
create table clara.metric_cell_periods(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  period_id uuid not null, period_start date not null, period_end date not null, ordinal int not null check(ordinal>=0),
  primary key(cell_id,period_id), unique(cell_id,ordinal), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  foreign key(period_id,firm_id,client_id,period_start,period_end) references clara.reporting_periods(id,firm_id,client_id,period_start,period_end));
create table clara.metric_cell_snapshots(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null, snapshot_id uuid not null,
  primary key(cell_id,snapshot_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  foreign key(snapshot_id,firm_id,client_id) references clara.metric_input_snapshots(id,firm_id,client_id));
create table clara.metric_cell_account_sets(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null, account_set_version_id uuid not null,
  primary key(cell_id,account_set_version_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  foreign key(account_set_version_id,firm_id,client_id) references clara.account_set_versions(id,firm_id,client_id));
create table clara.metric_cell_constants(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null, constant_version_id uuid not null references clara.metric_constants(id),
  primary key(cell_id,constant_version_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id));
create table clara.metric_cell_entries(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null, entry_id uuid not null,
  primary key(cell_id,entry_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  foreign key(entry_id,firm_id,client_id) references clara.journal_entries(id,firm_id,client_id));
create table clara.metric_cell_documents(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null, document_id uuid not null,
  primary key(cell_id,document_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  foreign key(document_id,firm_id) references clara.documents(id,firm_id));
create constraint trigger t_metric_cell_document_binding after insert or update on clara.metric_cell_documents deferrable initially immediate for each row execute function clara._tf_metric_document_binding();
create table clara.metric_cell_presentation_maps(
  cell_id uuid not null, firm_id uuid not null references clara.firms(id), client_id uuid not null,
  presentation_map_version_id uuid not null references clara.presentation_map_versions(id),
  primary key(cell_id,presentation_map_version_id), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id));
create table clara.metric_cell_assessments(
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null,
  cell_id uuid not null, evaluator_version_id uuid not null references clara.evaluator_versions(id), observed_status text not null,
  observed_reason_key text, observed_numerator numeric, observed_denominator numeric, matches boolean not null,
  assessed_by uuid not null references clara.users(id), assessed_at timestamptz not null default now(),
  details jsonb not null check(jsonb_typeof(details)='object'), foreign key(cell_id,firm_id,client_id) references clara.metric_cells(id,firm_id,client_id),
  constraint ck_metric_cell_assessments_observed_numerator_finite check(observed_numerator is null or observed_numerator::text not in('NaN','Infinity','-Infinity')),
  constraint ck_metric_cell_assessments_observed_denominator_finite check(observed_denominator is null or observed_denominator::text not in('NaN','Infinity','-Infinity')));
/* A30b: a cap/timeout boundary that precludes a truthful metric output leaves an immutable ATTEMPT receipt, never a 5,001st or fabricated cell. The two classes stay honestly separate: cap_refusal carries four DB-measured counts; cancellation carries SQLSTATE 57014 with the configured timeout and diagnostics and is never labelled cost_exceeded. Insert-once (append-only + no-truncate arrive from the hardening loop below); the natural key is the idempotency key. */ create table clara.metric_evaluation_attempt_receipts(id uuid primary key default gen_random_uuid(), firm_id uuid not null references clara.firms(id), client_id uuid not null, run_id uuid not null, attempt_key text not null check(btrim(attempt_key)<>''), outcome_class text not null check(outcome_class in('cap_refusal','cancellation')), entrypoint text not null check(entrypoint in('clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)','clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)')), sqlstate text not null, existing_cell_count int, new_required_cell_count int, projected_cell_count int, cell_limit int, configured_statement_timeout text, diagnostics jsonb not null check(jsonb_typeof(diagnostics)='object'), recorded_by uuid not null references clara.users(id), recorded_at timestamptz not null default now(), foreign key(client_id,firm_id) references clara.clients(id,firm_id), unique(firm_id,client_id,run_id,attempt_key), constraint ck_metric_attempt_receipt_class check((outcome_class='cap_refusal' and sqlstate='CLR10' and existing_cell_count is not null and new_required_cell_count is not null and projected_cell_count is not null and cell_limit is not null and existing_cell_count>=0 and new_required_cell_count>=0 and cell_limit>0 and projected_cell_count=existing_cell_count+new_required_cell_count and projected_cell_count>cell_limit and configured_statement_timeout is null)or(outcome_class='cancellation' and sqlstate='57014' and existing_cell_count is null and new_required_cell_count is null and projected_cell_count is null and cell_limit is null and btrim(coalesce(configured_statement_timeout,''))<>'')));
-- Static positive-identity guard: TG_RELID + the exact key select prove every parent; no relation or column target is constructed.
create function clara._tf_metric_catalog_scope() returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$declare pf uuid;cf uuid;scoped boolean:=true;begin
if tg_relid='clara.metric_edge_policies'::regclass and tg_argv[0]='policy_set_id'then select firm_id into pf from clara.edge_policy_sets where id=new.policy_set_id;cf:=new.firm_id;elsif tg_relid='clara.presentation_map_versions'::regclass and tg_argv[0]='presentation_map_id'then select firm_id into pf from clara.presentation_maps where id=new.presentation_map_id;cf:=new.firm_id;elsif tg_relid='clara.presentation_map_version_members'::regclass and tg_argv[0]='presentation_map_version_id'then select firm_id into pf from clara.presentation_map_versions where id=new.presentation_map_version_id;cf:=new.firm_id;elsif tg_relid='clara.presentation_map_version_members'::regclass and tg_argv[0]='account_set_version_id'then select firm_id into pf from clara.account_set_versions where id=new.account_set_version_id;cf:=new.firm_id;
elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='definition_id'then select firm_id into pf from clara.metric_definitions where id=new.definition_id;cf:=new.firm_id;elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='unit_key'then select firm_id into pf from clara.metric_units where unit_key=new.unit_key;cf:=new.firm_id;elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='temporality_key'then select firm_id into pf from clara.metric_temporalities where temporality_key=new.temporality_key;cf:=new.firm_id;elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='edge_policy_set_id'then select firm_id into pf from clara.edge_policy_sets where id=new.edge_policy_set_id;cf:=new.firm_id;elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='averaging_policy_id'then select firm_id into pf from clara.averaging_policy_versions where id=new.averaging_policy_id;cf:=new.firm_id;elsif tg_relid='clara.metric_definition_versions'::regclass and tg_argv[0]='supersedes_version_id'then if new.supersedes_version_id is null then return new;end if;select firm_id into pf from clara.metric_definition_versions where id=new.supersedes_version_id;cf:=new.firm_id;
elsif tg_relid='clara.metric_input_producer_version_members'::regclass and tg_argv[0]='producer_version_id'then select firm_id into pf from clara.metric_input_producer_versions where id=new.producer_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_input_snapshots'::regclass and tg_argv[0]='producer_version_id'then select firm_id into pf from clara.metric_input_producer_versions where id=new.producer_version_id;cf:=new.firm_id;elsif tg_relid='clara.evaluator_version_members'::regclass and tg_argv[0]='evaluator_version_id'then select firm_id into pf from clara.evaluator_versions where id=new.evaluator_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_evaluation_contexts'::regclass and tg_argv[0]='evaluator_version_id'then select firm_id into pf from clara.evaluator_versions where id=new.evaluator_version_id;cf:=new.firm_id;
elsif tg_relid='clara.metric_cells'::regclass and tg_argv[0]='definition_version_id'then if new.definition_version_id is null then return new;end if;select firm_id into pf from clara.metric_definition_versions where id=new.definition_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_cells'::regclass and tg_argv[0]='evaluator_version_id'then select firm_id into pf from clara.evaluator_versions where id=new.evaluator_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_cells'::regclass and tg_argv[0]='na_reason_version_id'then if new.na_reason_version_id is null then return new;end if;select firm_id into pf from clara.metric_na_reason_versions where id=new.na_reason_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_cells'::regclass and tg_argv[0]='unit_key'then select firm_id into pf from clara.metric_units where unit_key=new.unit_key;cf:=new.firm_id;elsif tg_relid='clara.metric_cells'::regclass and tg_argv[0]='supersedes_cell_id'then if new.supersedes_cell_id is null then return new;end if;select firm_id into pf from clara.metric_cells where id=new.supersedes_cell_id;cf:=new.firm_id;
elsif tg_relid='clara.metric_cell_constants'::regclass and tg_argv[0]='constant_version_id'then select firm_id into pf from clara.metric_constants where id=new.constant_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_cell_presentation_maps'::regclass and tg_argv[0]='presentation_map_version_id'then select firm_id into pf from clara.presentation_map_versions where id=new.presentation_map_version_id;cf:=new.firm_id;elsif tg_relid='clara.metric_cell_assessments'::regclass and tg_argv[0]='evaluator_version_id'then select firm_id into pf from clara.evaluator_versions where id=new.evaluator_version_id;cf:=new.firm_id;else raise exception 'metric catalog guard invocation is not registered'using errcode='CLR10';end if;if not found then raise exception 'metric catalog reference is absent'using errcode='CLR10';end if;if scoped and pf is not null and pf is distinct from cf then raise exception 'metric catalog reference is cross-firm'using errcode='CLR11';end if;return new;end$$;
revoke all on function clara._tf_metric_catalog_scope() from public;
create constraint trigger t_scope_metric_edge_policy_set after insert or update on clara.metric_edge_policies deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('policy_set_id');create constraint trigger t_scope_presentation_map_parent after insert or update on clara.presentation_map_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('presentation_map_id');create constraint trigger t_scope_presentation_member_map after insert or update on clara.presentation_map_version_members deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('presentation_map_version_id');create constraint trigger t_scope_presentation_member_set after insert or update on clara.presentation_map_version_members deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('account_set_version_id');create constraint trigger t_scope_definition_parent after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('definition_id');create constraint trigger t_scope_definition_unit after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('unit_key');create constraint trigger t_scope_definition_temporality after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('temporality_key');create constraint trigger t_scope_definition_edge_policy after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('edge_policy_set_id');create constraint trigger t_scope_definition_averaging after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('averaging_policy_id');create constraint trigger t_scope_definition_supersedes after insert or update on clara.metric_definition_versions deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('supersedes_version_id');create constraint trigger t_scope_producer_member_version after insert or update on clara.metric_input_producer_version_members deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('producer_version_id');create constraint trigger t_scope_snapshot_producer after insert or update on clara.metric_input_snapshots deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('producer_version_id');create constraint trigger t_scope_evaluator_member_version after insert or update on clara.evaluator_version_members deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('evaluator_version_id');create constraint trigger t_scope_context_evaluator after insert or update on clara.metric_evaluation_contexts deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('evaluator_version_id');create constraint trigger t_scope_cell_definition after insert or update on clara.metric_cells deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('definition_version_id');create constraint trigger t_scope_cell_evaluator after insert or update on clara.metric_cells deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('evaluator_version_id');create constraint trigger t_scope_cell_na_reason after insert or update on clara.metric_cells deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('na_reason_version_id');create constraint trigger t_scope_cell_unit after insert or update on clara.metric_cells deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('unit_key');create constraint trigger t_scope_cell_supersedes after insert or update on clara.metric_cells deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('supersedes_cell_id');create constraint trigger t_scope_cell_constant after insert or update on clara.metric_cell_constants deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('constant_version_id');create constraint trigger t_scope_cell_presentation_map after insert or update on clara.metric_cell_presentation_maps deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('presentation_map_version_id');create constraint trigger t_scope_assessment_evaluator after insert or update on clara.metric_cell_assessments deferrable initially immediate for each row execute function clara._tf_metric_catalog_scope('evaluator_version_id');
do $rls$
declare n text; p text;
begin
  foreach n in array array[
    'metric_units','metric_temporalities','metric_primitives','metric_na_reason_versions','metric_constants',
    'edge_policy_sets','metric_edge_policies','averaging_policy_versions','account_sets','account_set_versions',
    'account_set_version_members','presentation_maps','presentation_map_versions','presentation_map_version_members',
    'metric_definitions','metric_definition_versions','metric_input_producer_versions','metric_input_producer_version_members','metric_input_snapshots',
    'metric_input_snapshot_periods','metric_input_snapshot_contributions','metric_input_snapshot_open_items',
    'metric_input_snapshot_allocations','metric_input_snapshot_samples','evaluator_versions','evaluator_version_members',
    'metric_evaluation_contexts','metric_evaluation_context_periods','metric_cells','metric_cell_periods',
    'metric_cell_snapshots','metric_cell_account_sets','metric_cell_constants','metric_cell_entries',
    'metric_cell_documents','metric_cell_presentation_maps','metric_cell_assessments','metric_evaluation_attempt_receipts'
  ] loop
    execute format('alter table clara.%I enable row level security',n);
    execute format('alter table clara.%I force row level security',n);
    p:=left(regexp_replace(n,'[^a-z0-9]+','','g'),38);
    execute format('create policy %I on clara.%I for all to clara_fn_owner using(true) with check(true)','p_'||p||'_owner',n);
    execute format('create policy %I on clara.%I for select to clara_authenticated using(firm_id is null or firm_id=clara.jwt_firm())','p_'||p||'_human',n);
    execute format('grant select on clara.%I to clara_authenticated',n);
    execute format('revoke insert,update,delete,truncate on clara.%I from clara_authenticated,clara_agent_ro,clara_runtime,clara_wake_interactive,clara_wake_proactive',n);
    execute format('create trigger %I before update or delete on clara.%I for each row execute function clara._tf_append_only()',
      't_'||left(regexp_replace(n,'[^a-z0-9]+','','g'),40)||'_append_only',n);
    execute format('create trigger %I before truncate on clara.%I for each statement execute function clara._tf_no_truncate()',
      't_'||left(regexp_replace(n,'[^a-z0-9]+','','g'),40)||'_no_truncate',n);
  end loop;
end $rls$;drop trigger t_accountsetversions_append_only on clara.account_set_versions;create function clara._tf_account_set_version_lifecycle()returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$begin if tg_op='DELETE'or old.state<>'published'or new.state<>'superseded'or new.effective_to is null or(to_jsonb(new)-array['state','effective_to'])is distinct from(to_jsonb(old)-array['state','effective_to'])then raise exception 'account-set version admits only published-to-superseded window closure'using errcode='CLR08';end if;return new;end$$;revoke all on function clara._tf_account_set_version_lifecycle()from public;create trigger t_accountsetversions_lifecycle before update or delete on clara.account_set_versions for each row execute function clara._tf_account_set_version_lifecycle();
create type clara.metric_value_v1 as(
  status text, reason_key text, numerator numeric, denominator numeric,
  currency_power smallint, days_power smallint, count_power smallint, temporality text,
  period_id uuid, account_set_version_ids uuid[], constant_version_ids uuid[],
  entry_ids uuid[], document_ids uuid[], inputs jsonb);
create function clara._metric_selector_account_ids(p_client uuid,p_selector jsonb) returns uuid[] language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare ids uuid[]; allowed text[]:=array['account_ids','account_codes','account_types','account_classes','code_from','code_to'];v_firm uuid;unresolved jsonb;
begin
  select firm_id into strict v_firm from clara.clients where id=p_client;
  if jsonb_typeof(p_selector)<>'object' or exists(select 1 from jsonb_object_keys(p_selector) k where not k=any(allowed)) then raise exception 'selector contains an unknown field' using errcode='CLR10',detail='{"reason":"unknown_field"}'; end if;
  /* i2 fail-closed exactness: every EXPLICIT account id/code must name exactly one ACTIVE account of this client. A miss — absent, inactive, another client or firm, or a malformed identifier — is named and refused, never silently dropped. The identifier comparison is textual so a malformed element is that same named refusal rather than a raw 22P02. Non-explicit selectors keep their unchanged set semantics. */
  select coalesce(jsonb_agg(jsonb_build_object('field',q.f,'value',q.v,'matched_active_accounts',q.n) order by q.f,q.v),'[]'::jsonb) into unresolved from(select e.f,e.v,(select count(*) from clara.coa_accounts ea where ea.client_id=p_client and ea.firm_id=v_firm and ea.is_active and case e.f when 'account_ids' then ea.account_id::text else ea.account_code end=e.v)::int n from(select 'account_ids' f,g.v from jsonb_array_elements_text(coalesce(p_selector->'account_ids','[]'::jsonb))g(v) union all select 'account_codes',g.v from jsonb_array_elements_text(coalesce(p_selector->'account_codes','[]'::jsonb))g(v))e(f,v))q where q.n<>1;
  if jsonb_array_length(unresolved)>0 then raise exception 'selector names an account that is not exactly one active account of this client' using errcode='CLR10',detail=jsonb_build_object('reason','selector_element_unresolved','unresolved',unresolved,'fix','name only active accounts of this client in account_ids/account_codes, or select the population with a non-explicit selector')::text; end if;
  select coalesce(array_agg(a.account_id order by a.account_id),'{}') into ids
    from clara.coa_accounts a where a.client_id=p_client and a.firm_id=v_firm and a.is_active
      and (not(p_selector?'account_ids') or a.account_id in(select jsonb_array_elements_text(p_selector->'account_ids')::uuid))
      and (not(p_selector?'account_codes') or a.account_code in(select jsonb_array_elements_text(p_selector->'account_codes')))
      and (not(p_selector?'account_types') or a.account_type in(select jsonb_array_elements_text(p_selector->'account_types')))
      and (not(p_selector?'account_classes') or a.account_class in(select jsonb_array_elements_text(p_selector->'account_classes')))
      and (not(p_selector?'code_from') or a.account_code>=p_selector->>'code_from')
      and (not(p_selector?'code_to') or a.account_code<=p_selector->>'code_to');
  return ids;
end $$;
revoke all on function clara._metric_selector_account_ids(uuid,jsonb) from public;create function clara.verify_account_set_version_freeze(p_version uuid)returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$declare v record;ids uuid[];n int;h bytea;ch bytea;bad int;begin select * into v from clara.account_set_versions where id=p_version;if not found then raise exception 'account-set version absent'using errcode='CLR11';end if;select coalesce(array_agg(account_id order by ordinal),'{}'),count(*)::int,count(*)filter(where ordinal<>ro-1 or ordinal<>ra-1)::int into ids,n,bad from(select account_id,ordinal,row_number()over(order by ordinal)ro,row_number()over(order by account_id)ra from clara.account_set_version_members where account_set_version_id=p_version)m;h:=clara._hash(to_jsonb(ids));ch:=clara._hash(jsonb_build_object('schema','clara.account-set-version/v1','selector',v.selector,'zero_when_no_rows',v.zero_when_no_rows,'members',ids));if bad<>0 or n<>v.frozen_member_count or h<>v.frozen_members_sha256 or ch<>v.content_sha256 then raise exception 'account-set frozen corpus does not reconstruct'using errcode='CLR11',detail=jsonb_build_object('reason','account_set_integrity_mismatch','version_id',p_version,'actual_count',n,'stored_count',v.frozen_member_count)::text;end if;return jsonb_build_object('ok',true,'version_id',p_version,'member_count',n,'members_sha256',encode(h,'hex'));end$$;revoke all on function clara.verify_account_set_version_freeze(uuid)from public;create function clara._tf_account_set_version_integrity()returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$declare v uuid;p record;begin if tg_relid='clara.account_set_version_members'::regclass then v:=new.account_set_version_id;select * into p from clara.account_set_versions where id=v;if not found or p.created_xid<>pg_current_xact_id()then raise exception 'account-set members are sealed after version creation'using errcode='CLR08';end if;return new;end if;v:=new.id;select * into strict p from clara.account_set_versions where id=v;perform clara.verify_account_set_version_freeze(v);if(select count(*)from clara.account_set_versions where account_set_id=p.account_set_id and state='published')<>1 or exists(select 1 from clara.account_set_versions a join clara.account_set_versions b on a.account_set_id=b.account_set_id and a.id<b.id where a.account_set_id=p.account_set_id and a.effective_from<=coalesce(b.effective_to,'infinity')and b.effective_from<=coalesce(a.effective_to,'infinity'))or exists(select 1 from(select effective_from,lag(effective_to)over(order by effective_from,revision)prior_to,row_number()over(order by effective_from,revision)rn from clara.account_set_versions where account_set_id=p.account_set_id)q where rn>1 and(prior_to is null or effective_from<>prior_to+1))then raise exception 'account-set effective versions are not exactly-one contiguous windows'using errcode='CLR11',detail='{"reason":"effective_version_ambiguity"}';end if;return null;end$$;revoke all on function clara._tf_account_set_version_integrity()from public;create constraint trigger t_account_set_version_integrity after insert or update on clara.account_set_versions deferrable initially deferred for each row execute function clara._tf_account_set_version_integrity();create trigger t_account_set_member_integrity before insert on clara.account_set_version_members for each row execute function clara._tf_account_set_version_integrity();
create function clara.create_account_set_v1(
  p_client uuid,p_set_key text,p_title text,p_selector jsonb,p_zero_when_no_rows boolean,p_effective_from date,p_op_key text
) returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record;s uuid;v uuid;ids uuid[];h bytea;prior jsonb;next_revision int;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  perform 1 from clara.clients where id=p_client and firm_id=c.firm;
  if not found then raise exception 'client not found' using errcode='CLR11';end if;
  prior:=clara._reserve_op(c.firm,'create_account_set_v1',p_op_key,clara._hash(jsonb_build_object('client',p_client,'key',p_set_key,'title',p_title,'selector',p_selector,'zero_when_no_rows',p_zero_when_no_rows,'effective_from',p_effective_from)));
  if prior is not null then return prior;end if;
  ids:=clara._metric_selector_account_ids(p_client,p_selector);if coalesce(p_zero_when_no_rows,false)and cardinality(ids)=0 then raise exception 'zero policy requires a live frozen account'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"select at least one live account whose requested period may have no fact rows"}';end if;
  select id into s from clara.account_sets where client_id=p_client and firm_id=c.firm and set_key=p_set_key for update;
  if s is null then begin insert into clara.account_sets(firm_id,client_id,set_key,title,created_by)values(c.firm,p_client,p_set_key,p_title,c.actor)returning id into s;next_revision:=1;exception when unique_violation then select id into strict s from clara.account_sets where client_id=p_client and firm_id=c.firm and set_key=p_set_key for update;select coalesce(max(revision),0)+1 into next_revision from clara.account_set_versions where account_set_id=s;end;else select coalesce(max(revision),0)+1 into next_revision from clara.account_set_versions where account_set_id=s;end if;
  if exists(select 1 from clara.account_set_versions where account_set_id=s and state='published'and effective_from>=p_effective_from)then raise exception 'account-set version effective window overlaps or reverses'using errcode='CLR10',detail='{"reason":"effective_window_overlap"}';end if;update clara.account_set_versions set state='superseded',effective_to=p_effective_from-1 where account_set_id=s and state='published';h:=clara._hash(to_jsonb(ids));
  insert into clara.account_set_versions(firm_id,client_id,account_set_id,revision,selector,zero_when_no_rows,frozen_member_count,frozen_members_sha256,content_sha256,state,effective_from,created_by)
  values(c.firm,p_client,s,next_revision,p_selector,coalesce(p_zero_when_no_rows,false),cardinality(ids),h,clara._hash(jsonb_build_object('schema','clara.account-set-version/v1','selector',p_selector,'zero_when_no_rows',coalesce(p_zero_when_no_rows,false),'members',ids)),'published',p_effective_from,c.actor)returning id into v;
  insert into clara.account_set_version_members select v,c.firm,p_client,u.id,u.ord-1 from unnest(ids)with ordinality u(id,ord);
  return clara._finish_op(c.firm,'create_account_set_v1',p_op_key,jsonb_build_object('account_set_id',s,'account_set_version_id',v,'revision',next_revision));
end $$;
revoke all on function clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text) from public;
create function clara._metric_input_dataset_v1(p_firm uuid,p_client uuid,p_period_ids uuid[]) returns jsonb
  language sql stable security definer set search_path=clara,pg_temp as $$
with ps as (
  select * from clara.reporting_periods where firm_id=p_firm and client_id=p_client and id=any(p_period_ids)
), bounds as (select min(period_start) min_start,max(period_end) max_end from ps), facts as (
  select jl.id journal_line_id,je.id entry_id,je.document_id,je.filing_id,a.account_id,bp.id bound_period_id,je.posting_date,a.account_type,a.account_class,jl.debit_cents,jl.credit_cents,je.source_doc_sha256
  from clara.journal_entries je join lateral (select p.id from ps p where je.posting_date between p.period_start and p.period_end order by p.period_start,p.period_end,p.id limit 1) bp on true
  join clara.journal_lines jl on jl.entry_id=je.id and jl.firm_id=p_firm and jl.client_id=p_client
  join clara.coa_accounts a on a.firm_id=p_firm and a.client_id=p_client and a.account_code=jl.account_code
  where je.firm_id=p_firm and je.client_id=p_client and je.status='approved'
), items as (select oi.* from bounds b join clara.open_items oi on oi.firm_id=p_firm and oi.client_id=p_client and oi.item_date<=b.max_end),
allocs as (select oa.* from bounds b join clara.open_item_allocations oa on oa.firm_id=p_firm and oa.client_id=p_client and oa.effective_date<=b.max_end join items i on i.id=oa.item_id and i.domain=oa.domain and i.firm_id=oa.firm_id and i.client_id=oa.client_id),
history as (
  select je.posting_date,a.account_id,jl.debit_cents,jl.credit_cents from bounds b
  join clara.journal_entries je on je.firm_id=p_firm and je.client_id=p_client and je.status='approved' and je.posting_date<=b.max_end
  join clara.journal_lines jl on jl.entry_id=je.id and jl.firm_id=p_firm and jl.client_id=p_client
  join clara.coa_accounts a on a.firm_id=p_firm and a.client_id=p_client and a.account_code=jl.account_code
), sample_dates as (
  select p.id period_id,d::date sample_date from ps p cross join lateral (
    select p.period_start-1 d union select p.period_end
    union select (date_trunc('month',g)+interval '1 month - 1 day')::date
      from generate_series(date_trunc('month',p.period_start),date_trunc('month',p.period_end),interval '1 month') g
      where (date_trunc('month',g)+interval '1 month - 1 day')::date between p.period_start and p.period_end
  ) q
), samples as (
  select sd.period_id,sd.sample_date,a.account_id,a.account_code,a.account_type,a.account_class,
    coalesce(sum(h.debit_cents-h.credit_cents),0)::bigint balance_cents
  from sample_dates sd cross join clara.coa_accounts a
  left join history h on h.account_id=a.account_id and h.posting_date<=sd.sample_date
  where a.firm_id=p_firm and a.client_id=p_client
  group by sd.period_id,sd.sample_date,a.account_id,a.account_code,a.account_type,a.account_class
)
select jsonb_build_object(
  'schema','clara.metric-input/v1',
  'periods',coalesce((select jsonb_agg(jsonb_build_object('id',id,'start',period_start,'end',period_end) order by period_start,id) from ps),'[]'),
  'contributions',coalesce((select jsonb_agg(to_jsonb(f) order by posting_date,entry_id,journal_line_id) from facts f),'[]'),
  'open_items',coalesce((select jsonb_agg(jsonb_build_object('item_id',id,'domain',domain,'counterparty_id',counterparty_id,'entry_id',entry_id,'item_kind',item_kind,'item_date',item_date,'due_date',due_date,'amount_cents',amount_cents) order by item_date,id) from items),'[]'),
  'allocations',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',id,'item_id',item_id,'domain',domain,'effective_date',effective_date,'amount_cents',amount_cents,'operation_kind',operation_kind,'application_group',application_group) order by effective_date,id) from allocs),'[]'),
  'samples',coalesce((select jsonb_agg(to_jsonb(s) order by period_id,sample_date,account_id) from samples s),'[]')
) $$;
revoke all on function clara._metric_input_dataset_v1(uuid,uuid,uuid[]) from public;
create function clara.mint_metric_input_snapshot_v1(p_client uuid,p_period_ids uuid[],p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; r record; d jsonb; w text; sid uuid; pv uuid; prior jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_period_ids is null or cardinality(p_period_ids) not between 1 and 25 then
    raise exception 'period source cost exceeded' using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"source_periods","limit":25}';
  end if;
  if cardinality(array(select distinct x from unnest(p_period_ids)x))<>cardinality(p_period_ids) then
    raise exception 'period ids must be distinct' using errcode='CLR10',detail='{"reason":"period_binding_invalid"}';
  end if;
  select array_agg(id order by period_start,period_end,id) ids,count(*) n,count(distinct grain) grains,
    min(period_start) min_start,max(period_end) max_end into r from clara.reporting_periods
    where firm_id=c.firm and client_id=p_client and id=any(p_period_ids);
  if r.n<>cardinality(p_period_ids) or r.grains<>1 then
    raise exception 'period binding incomplete or cross-tenant' using errcode='CLR11';
  end if;
  prior:=clara._reserve_op(c.firm,'mint_metric_input_snapshot_v1',p_op_key,clara._hash(jsonb_build_object('client',p_client,'periods',r.ids)));
  if prior is not null then return prior; end if;
  select x.dataset,x.watermark into d,w from (select clara._metric_input_dataset_v1(c.firm,p_client,r.ids) dataset,pg_current_snapshot()::text watermark)x;
  select id into strict pv from clara.metric_input_producer_versions where firm_id is null and producer_name='metric_input_snapshot' and version=1;
  set constraints clara.t_metric_input_snapshot_reconstruct,clara.t_metric_input_period_reconstruct,clara.t_metric_input_contribution_reconstruct,clara.t_metric_input_open_item_reconstruct,clara.t_metric_input_allocation_reconstruct,clara.t_metric_input_sample_reconstruct deferred;
  insert into clara.metric_input_snapshots(firm_id,client_id,producer_version_id,books_watermark,dataset_sha256,min_period_start,max_period_end,
    contribution_count,open_item_count,allocation_count,sample_count,minted_by)
  values(c.firm,p_client,pv,w,clara._hash(d),r.min_start,r.max_end,jsonb_array_length(d->'contributions'),
    jsonb_array_length(d->'open_items'),jsonb_array_length(d->'allocations'),jsonb_array_length(d->'samples'),c.actor) returning id into sid;
  insert into clara.metric_input_snapshot_periods
    select sid,c.firm,p_client,rp.id,rp.period_start,rp.period_end,u.ord-1 from unnest(r.ids) with ordinality u(id,ord)
    join clara.reporting_periods rp on rp.id=u.id and rp.firm_id=c.firm and rp.client_id=p_client;
  insert into clara.metric_input_snapshot_contributions
    select sid,c.firm,p_client,(x->>'journal_line_id')::uuid,(x->>'entry_id')::uuid,nullif(x->>'document_id','')::uuid,nullif(x->>'filing_id','')::uuid,
      (x->>'account_id')::uuid,nullif(x->>'bound_period_id','')::uuid,(x->>'posting_date')::date,x->>'account_type',
      nullif(x->>'account_class',''),(x->>'debit_cents')::bigint,(x->>'credit_cents')::bigint,nullif(x->>'source_doc_sha256','')
    from jsonb_array_elements(d->'contributions')x;
  insert into clara.metric_input_snapshot_open_items
    select sid,c.firm,p_client,(x->>'item_id')::uuid,x->>'domain',(x->>'counterparty_id')::uuid,(x->>'entry_id')::uuid,
      x->>'item_kind',(x->>'item_date')::date,nullif(x->>'due_date','')::date,(x->>'amount_cents')::bigint from jsonb_array_elements(d->'open_items')x;
  insert into clara.metric_input_snapshot_allocations
    select sid,c.firm,p_client,(x->>'allocation_id')::uuid,(x->>'item_id')::uuid,x->>'domain',(x->>'effective_date')::date,
      (x->>'amount_cents')::bigint,x->>'operation_kind',(x->>'application_group')::uuid from jsonb_array_elements(d->'allocations')x;
  insert into clara.metric_input_snapshot_samples(
    snapshot_id,firm_id,client_id,period_id,sample_date,account_id,sample_ordinal,
    period_start,period_end,account_code,account_type,account_class,balance_cents)
    select sid,c.firm,p_client,(x->>'period_id')::uuid,(x->>'sample_date')::date,(x->>'account_id')::uuid,ord-1,
      rp.period_start,rp.period_end,x->>'account_code',x->>'account_type',nullif(x->>'account_class',''),(x->>'balance_cents')::bigint
    from jsonb_array_elements(d->'samples') with ordinality q(x,ord)
    join clara.reporting_periods rp on rp.id=(x->>'period_id')::uuid and rp.firm_id=c.firm and rp.client_id=p_client;
  perform clara._audit(c.firm,c.actor,null,null,'mint_metric_input_snapshot_v1',null,jsonb_build_object('snapshot_id',sid,'op_key',p_op_key));
  perform clara.verify_metric_input_snapshot(sid);
  set constraints clara.t_metric_input_snapshot_reconstruct,clara.t_metric_input_period_reconstruct,clara.t_metric_input_contribution_reconstruct,clara.t_metric_input_open_item_reconstruct,clara.t_metric_input_allocation_reconstruct,clara.t_metric_input_sample_reconstruct immediate;
  return clara._finish_op(c.firm,'mint_metric_input_snapshot_v1',p_op_key,jsonb_build_object('snapshot_id',sid,'dataset_sha256',encode(clara._hash(d),'hex')));
end $$;
revoke all on function clara.mint_metric_input_snapshot_v1(uuid,uuid[],text) from public;grant execute on function clara.mint_metric_input_snapshot_v1(uuid,uuid[],text) to clara_authenticated;
create function clara.verify_metric_input_snapshot(p_snapshot uuid)returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$declare s record;d jsonb;h bytea;begin select * into s from clara.metric_input_snapshots where id=p_snapshot;if not found then raise exception 'metric input snapshot is absent'using errcode='CLR10';end if;select jsonb_build_object('schema','clara.metric-input/v1','periods',coalesce((select jsonb_agg(jsonb_build_object('id',period_id,'start',period_start,'end',period_end)order by period_start,period_id)from clara.metric_input_snapshot_periods where snapshot_id=s.id),'[]'),'contributions',coalesce((select jsonb_agg(to_jsonb(c)-'snapshot_id'-'firm_id'-'client_id'order by posting_date,entry_id,journal_line_id)from clara.metric_input_snapshot_contributions c where snapshot_id=s.id),'[]'),'open_items',coalesce((select jsonb_agg(jsonb_build_object('item_id',item_id,'domain',domain,'counterparty_id',counterparty_id,'entry_id',entry_id,'item_kind',item_kind,'item_date',item_date,'due_date',due_date,'amount_cents',amount_cents)order by item_date,item_id)from clara.metric_input_snapshot_open_items where snapshot_id=s.id),'[]'),'allocations',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',allocation_id,'item_id',item_id,'domain',domain,'effective_date',effective_date,'amount_cents',amount_cents,'operation_kind',operation_kind,'application_group',application_group)order by effective_date,allocation_id)from clara.metric_input_snapshot_allocations where snapshot_id=s.id),'[]'),'samples',coalesce((select jsonb_agg(to_jsonb(x)order by period_id,sample_date,account_id)from(select period_id,sample_date,account_id,account_code,account_type,account_class,balance_cents from clara.metric_input_snapshot_samples where snapshot_id=s.id)x),'[]'))into d;h:=clara._hash(d);if h is distinct from s.dataset_sha256 or s.contribution_count<>(select count(*)from clara.metric_input_snapshot_contributions where snapshot_id=s.id)or s.open_item_count<>(select count(*)from clara.metric_input_snapshot_open_items where snapshot_id=s.id)or s.allocation_count<>(select count(*)from clara.metric_input_snapshot_allocations where snapshot_id=s.id)or s.sample_count<>(select count(*)from clara.metric_input_snapshot_samples where snapshot_id=s.id)or s.min_period_start is distinct from(select min(period_start)from clara.metric_input_snapshot_periods where snapshot_id=s.id)or s.max_period_end is distinct from(select max(period_end)from clara.metric_input_snapshot_periods where snapshot_id=s.id)then raise exception 'metric input snapshot header does not reconstruct from captured facts'using errcode='CLR10';end if;return jsonb_build_object('ok',true,'snapshot_id',s.id,'dataset_sha256',encode(h,'hex'),'contribution_count',s.contribution_count,'open_item_count',s.open_item_count,'allocation_count',s.allocation_count,'sample_count',s.sample_count,'min_period_start',s.min_period_start,'max_period_end',s.max_period_end);end$$;
revoke all on function clara.verify_metric_input_snapshot(uuid)from public;
create function clara._tf_metric_input_snapshot_reconstruct()returns trigger language plpgsql security definer set search_path=clara,pg_temp as $$declare s uuid;begin if tg_relid='clara.metric_input_snapshots'::regclass then s:=new.id;elsif tg_relid in('clara.metric_input_snapshot_periods'::regclass,'clara.metric_input_snapshot_contributions'::regclass,'clara.metric_input_snapshot_open_items'::regclass,'clara.metric_input_snapshot_allocations'::regclass,'clara.metric_input_snapshot_samples'::regclass)then s:=new.snapshot_id;else raise exception 'metric input reconstruction guard invocation is not registered'using errcode='CLR10';end if;perform clara.verify_metric_input_snapshot(s);return new;end$$;
revoke all on function clara._tf_metric_input_snapshot_reconstruct()from public;create constraint trigger t_metric_input_snapshot_reconstruct after insert or update on clara.metric_input_snapshots deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();create constraint trigger t_metric_input_period_reconstruct after insert or update on clara.metric_input_snapshot_periods deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();create constraint trigger t_metric_input_contribution_reconstruct after insert or update on clara.metric_input_snapshot_contributions deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();create constraint trigger t_metric_input_open_item_reconstruct after insert or update on clara.metric_input_snapshot_open_items deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();create constraint trigger t_metric_input_allocation_reconstruct after insert or update on clara.metric_input_snapshot_allocations deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();create constraint trigger t_metric_input_sample_reconstruct after insert or update on clara.metric_input_snapshot_samples deferrable initially immediate for each row execute function clara._tf_metric_input_snapshot_reconstruct();
set local search_path=pg_catalog,pg_temp;
do $freeze$ declare p uuid;h bytea;begin
with roster(o,s)as(values(0,'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)'),(1,'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),(2,'clara._human_ctx(integer)'),(3,'clara.role_rank(text)'),(4,'clara.jwt_sub()'),(5,'clara.jwt_firm()'),(6,'clara.actor_role_rank()'),(7,'clara._reserve_op(uuid,text,text,bytea)'),(8,'clara._hash(jsonb)'),(9,'clara._finish_op(uuid,text,text,jsonb)'),(10,'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),(11,'clara.verify_metric_input_snapshot(uuid)'),(12,'clara._tf_metric_input_snapshot_reconstruct()'),(13,'clara._tf_metric_document_binding()'),(14,'clara._active_document_filing(uuid,text,uuid,boolean)')),live as(select o,s,to_regprocedure(s)oid from roster),resolved as(select o,s,oid,sha256(convert_to(pg_get_functiondef(oid),'UTF8'))body_hash from live where oid is not null)select clara._hash(to_jsonb(string_agg(encode(body_hash,'hex'),''order by o)::text))into strict h from resolved having count(*)=15 and count(distinct oid)=15;
insert into clara.metric_input_producer_versions(firm_id,producer_name,version,entrypoint_signature,body_sha256,fact_schema)values(null,'metric_input_snapshot',1,'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)',h,'clara.metric-input/v1')returning id into p;
with roster(o,s)as(values(0,'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)'),(1,'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),(2,'clara._human_ctx(integer)'),(3,'clara.role_rank(text)'),(4,'clara.jwt_sub()'),(5,'clara.jwt_firm()'),(6,'clara.actor_role_rank()'),(7,'clara._reserve_op(uuid,text,text,bytea)'),(8,'clara._hash(jsonb)'),(9,'clara._finish_op(uuid,text,text,jsonb)'),(10,'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),(11,'clara.verify_metric_input_snapshot(uuid)'),(12,'clara._tf_metric_input_snapshot_reconstruct()'),(13,'clara._tf_metric_document_binding()'),(14,'clara._active_document_filing(uuid,text,uuid,boolean)'))insert into clara.metric_input_producer_version_members(producer_version_id,firm_id,ordinal,member_signature,body_sha256)select p,null,o,s,sha256(convert_to(pg_get_functiondef(to_regprocedure(s)),'UTF8'))from roster order by o;
end$freeze$;
create function clara.verify_metric_input_producer_freeze()returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$declare r record;h bytea;members int;resolved int;distinct_oids int;expected int;total int;begin for r in select v.id,v.firm_id,v.producer_name,v.version,v.entrypoint_signature,v.body_sha256 from clara.metric_input_producer_versions v order by v.id loop select count(*),count(to_regprocedure(m.member_signature)),count(distinct to_regprocedure(m.member_signature))into members,resolved,distinct_oids from clara.metric_input_producer_version_members m where m.producer_version_id=r.id;if members=0 or resolved<>members or distinct_oids<>members then raise exception 'metric input producer closure incomplete: %',r.producer_name using errcode='CLR10';end if;if r.firm_id is null and r.producer_name='metric_input_snapshot'and r.version=1 then with roster(o,s)as(values(0,'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)'),(1,'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),(2,'clara._human_ctx(integer)'),(3,'clara.role_rank(text)'),(4,'clara.jwt_sub()'),(5,'clara.jwt_firm()'),(6,'clara.actor_role_rank()'),(7,'clara._reserve_op(uuid,text,text,bytea)'),(8,'clara._hash(jsonb)'),(9,'clara._finish_op(uuid,text,text,jsonb)'),(10,'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),(11,'clara.verify_metric_input_snapshot(uuid)'),(12,'clara._tf_metric_input_snapshot_reconstruct()'),(13,'clara._tf_metric_document_binding()'),(14,'clara._active_document_filing(uuid,text,uuid,boolean)'))select count(*)into expected from roster x join clara.metric_input_producer_version_members m on m.producer_version_id=r.id and m.ordinal=x.o and m.member_signature=x.s;if r.entrypoint_signature<>'clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)'or members<>15 or expected<>15 then raise exception 'metric input producer roster mismatch: %',r.producer_name using errcode='CLR10';end if;end if;if exists(select 1 from clara.metric_input_producer_version_members m where m.producer_version_id=r.id and m.body_sha256 is distinct from sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature)),'UTF8')))then raise exception 'metric input producer freeze mismatch: %',r.producer_name using errcode='CLR10';end if;select clara._hash(to_jsonb(string_agg(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature)),'UTF8')),'hex'),''order by m.ordinal)::text))into strict h from clara.metric_input_producer_version_members m where m.producer_version_id=r.id;if h is distinct from r.body_sha256 then raise exception 'metric input producer closure mismatch: %',r.producer_name using errcode='CLR10';end if;end loop;select count(*)into total from clara.metric_input_producer_versions;return jsonb_build_object('ok',true,'verified_producers',total);end$$;
revoke all on function clara.verify_metric_input_producer_freeze()from public;
reset role;
do $tail$
declare b text;n int;rls int;owners int;humans int;v_immut int;v_truncate int;guards int;producer_members int;
begin
  select coalesce(string_agg(p.oid::regprocedure::text||':'||md5(p.prosrc),E'\n'order by 1),'(none)')into b from pg_proc p where p.pronamespace='clara'::regnamespace and lower(coalesce(p.prosrc,''))~'(insert\s+into|update)\s+clara\.coa_accounts\M';if b<>(select v from _delta_pre where k='coa_writers')then raise exception 'delta tail: existing coa writer body changed'using errcode='CLR10';end if;
  perform clara.verify_metric_input_producer_freeze();if current_user<>(select v from _delta_pre where k='deploy_principal')or current_role<>(select v from _delta_pre where k='deploy_principal')then raise exception 'delta tail: role was not reset (user %, role %)',current_user,current_role using errcode='CLR10';end if;
  select count(*)into n from clara.coa_accounts where account_id is null;if n<>0 then raise exception 'delta tail: % chart rows lack stable UUID identity',n using errcode='CLR10';end if;
  with protected as(select c.oid from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='clara'and c.relkind='r'and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='firm_id'and not a.attisdropped)and(c.relname like'metric_%'or c.relname in('edge_policy_sets','averaging_policy_versions','account_sets','account_set_versions','account_set_version_members','presentation_maps','presentation_map_versions','presentation_map_version_members','evaluator_versions','evaluator_version_members')))select count(*)filter(where c.relrowsecurity and c.relforcerowsecurity),count(*)filter(where exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polroles=array['clara_fn_owner'::regrole]::oid[])),count(*)filter(where exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polroles=array['clara_authenticated'::regrole]::oid[])),count(*)filter(where exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname like't_%_append_only'and not t.tgisinternal)),count(*)filter(where exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname like't_%_no_truncate'and not t.tgisinternal))into rls,owners,humans,v_immut,v_truncate from protected x join pg_class c on c.oid=x.oid;
  if rls<>38 or owners<>38 or humans<>38 or v_immut<>37 or v_truncate<>38 then raise exception 'delta tail: hardening census RLS %, owner %, human %, append %, truncate %, expected 38/38/38/37/38',rls,owners,humans,v_immut,v_truncate using errcode='CLR10';end if;
  select count(*)into guards from pg_trigger where tgfoid='clara._tf_metric_catalog_scope()'::regprocedure and not tgisinternal;if guards<>22 then raise exception 'delta tail: metric catalog guards %, expected 22',guards using errcode='CLR10';end if;select count(*)into producer_members from clara.metric_input_producer_version_members m join clara.metric_input_producer_versions v on v.id=m.producer_version_id where v.producer_name='metric_input_snapshot'and v.version=1 and v.firm_id is null;if producer_members<>15 then raise exception 'delta tail: producer closure %, expected 15',producer_members using errcode='CLR10';end if;if(select count(*)from pg_trigger where tgfoid='clara._tf_account_set_version_integrity()'::regprocedure and not tgisinternal)<>2 or not exists(select 1 from pg_trigger where tgname='t_account_set_version_integrity'and tgdeferrable and tginitdeferred)or has_function_privilege('public','clara.verify_account_set_version_freeze(uuid)','execute')then raise exception 'delta tail: account-set freeze integrity posture is false'using errcode='CLR10';end if;
  raise notice 'delta base OK: stable COA UUIDs; 38 forced-RLS owner+human policy pairs (incl. the immutable A30b evaluation-attempt receipt); one firm-wide run-context identity; immutable coverage 37 append + 1 account-set lifecycle; no-truncate 38; 22 catalog guards; exact account-set count/hash/order freeze and non-overlap; 4 captured fact families; finite constants; producer 1/15; exact filing + period FKs; deploy principal restored; existing COA writers unchanged.';
end $tail$;
