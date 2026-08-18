-- 0094_f_a1_usage.sql -- Wave-F Track A, F-A1 PR-1, writer lane piece 1 of 2:
-- clara.llm_usage_events + clara.record_llm_usage_event.
-- =====================================================================================
-- APPLY ORDER: this file FIRST, 0095_f_a1_writer.sql SECOND (alphabetical, and that is
-- deliberate: persist_witness_facts calls clara.record_llm_usage_event, so its dependency must
-- already exist). Numbers are claimed at MERGE time (hard constraint 10;
-- .claude/rules/db-migrations.md). Design of record: f-a1-witness-pair-design.md SS3.6 + Annex C.
--
-- NO D1 WRITE-QUIESCE OBLIGATION -- both objects here are BRAND NEW (a new table, a new verb),
-- nothing replaces a live writer's body.
--
-- clara.llm_usage_events: append-only (the house idiom, clara._tf_append_only / _tf_no_truncate,
-- 0003:431-443), forced RLS + the owner/human policy pair + scoped grant
-- (.claude/rules/db-migrations.md), per-call rows (firm, document, task, channel text|vision,
-- engine_id, prompt hash, token counts, duration, outcome). NO SPEND REFUSAL ANYWHERE (law 76):
-- this table only ever RECORDS a call, it never gates one -- no CHECK or trigger here inspects a
-- budget, a cap, or a concurrency window.
--
-- clara.record_llm_usage_event: THE MINIMAL INSERT VERB, EXECUTE-granted to clara_runtime ONLY,
-- so PR-2's runtime can record metering directly at call time -- independent of whether/when a
-- witness pair is ever persisted, since a failed or abandoned model call still cost money and is
-- still worth recording. clara.persist_witness_facts (the sibling writer file) ALSO calls this
-- same verb, optionally, when its caller passes usage metadata inline -- see that file's header.
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
do $pre$
begin
  if not exists (select 1 from clara.schema_migrations where version = '0088_masb_wording_seed_lexicon') then
    raise exception 'f_a1_usage prestate: 0088_masb_wording_seed_lexicon is not applied -- frontier mismatch' using errcode='CLR10';
  end if;
  if to_regclass('clara.llm_usage_events') is not null
     or to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null then
    raise exception 'f_a1_usage prestate: already applied' using errcode='CLR10';
  end if;
  perform 'clara._tf_append_only()'::regprocedure;
  perform 'clara._tf_no_truncate()'::regprocedure;
  perform 'clara.jwt_firm()'::regprocedure;
  if not exists (select 1 from pg_constraint where conname='uq_documents_id_firm') then
    raise exception 'f_a1_usage prestate: clara.documents(id,firm_id) is not uniquely keyed -- the FK this file adds would not bind' using errcode='CLR10';
  end if;
  raise notice 'f_a1_usage prestate: clean -- llm_usage_events / record_llm_usage_event both absent, every leaf this file needs is live';
end
$pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- clara.llm_usage_events.
-- =====================================================================================
create table clara.llm_usage_events (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null,
  document_id   uuid        not null,
  task_id       uuid        not null,
  channel       text        not null check (channel in ('text','vision')),
  engine_id     text        not null check (btrim(engine_id) <> ''),
  prompt_hash   text,
  input_tokens  int         check (input_tokens is null or input_tokens >= 0),
  output_tokens int         check (output_tokens is null or output_tokens >= 0),
  duration_ms   int         check (duration_ms is null or duration_ms >= 0),
  outcome       text        not null check (outcome in ('success','refused','error','timeout')),
  created_at    timestamptz not null default clock_timestamp(),
  constraint fk_llm_usage_events_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_llm_usage_events_task foreign key (task_id, firm_id)
    references clara.document_processing_tasks(id, firm_id)
);
create index ix_llm_usage_events_firm on clara.llm_usage_events(firm_id, created_at desc);
create index ix_llm_usage_events_document on clara.llm_usage_events(document_id, created_at);

create trigger t_llm_usage_events_append_only before update or delete
  on clara.llm_usage_events for each row execute function clara._tf_append_only();
create trigger t_llm_usage_events_no_truncate before truncate
  on clara.llm_usage_events for each statement execute function clara._tf_no_truncate();

alter table clara.llm_usage_events enable row level security;
alter table clara.llm_usage_events force row level security;
create policy p_llm_usage_events_owner on clara.llm_usage_events
  for all to clara_fn_owner using (true) with check (true);
create policy p_llm_usage_events_human on clara.llm_usage_events
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.llm_usage_events to clara_authenticated;

-- =====================================================================================
-- SECTION 2 -- clara.record_llm_usage_event.
-- =====================================================================================
create function clara.record_llm_usage_event(p_firm uuid, p_document uuid, p_task uuid,
    p_channel text, p_engine_id text, p_prompt_hash text, p_input_tokens int,
    p_output_tokens int, p_duration_ms int, p_outcome text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid;
begin
  if p_channel not in ('text','vision') then
    raise exception 'llm usage channel must be text or vision' using errcode='CLR10';
  end if;
  if coalesce(p_outcome,'') not in ('success','refused','error','timeout') then
    raise exception 'llm usage outcome is not a recognised value' using errcode='CLR10';
  end if;
  -- NO SPEND REFUSAL ANYWHERE (law 76): this verb never inspects a budget, a cap or a
  -- concurrency window -- it is a pure metering record, always accepted for a well-formed call.
  insert into clara.llm_usage_events(firm_id,document_id,task_id,channel,engine_id,prompt_hash,
      input_tokens,output_tokens,duration_ms,outcome)
    values(p_firm,p_document,p_task,p_channel,p_engine_id,p_prompt_hash,
      p_input_tokens,p_output_tokens,p_duration_ms,p_outcome)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text) from public;
grant execute on function clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text) to clara_runtime;

reset role;

-- =====================================================================================
-- SECTION 3 -- TAIL CENSUS.
-- =====================================================================================
do $tail$
declare v_rls boolean; v_force boolean; v_n int;
begin
  if to_regclass('clara.llm_usage_events') is null then
    raise exception 'f_a1_usage tail: clara.llm_usage_events did not install' using errcode='CLR10';
  end if;
  select relrowsecurity, relforcerowsecurity into v_rls, v_force
    from pg_class where oid = 'clara.llm_usage_events'::regclass;
  if not v_rls or not v_force then
    raise exception 'f_a1_usage tail: llm_usage_events is missing ENABLE/FORCE row level security' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid = 'clara.llm_usage_events'::regclass;
  if v_n <> 2 then
    raise exception 'f_a1_usage tail: llm_usage_events does not carry exactly 2 policies (got %)', v_n using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='clara.llm_usage_events'::regclass
      and tgfoid='clara._tf_append_only()'::regprocedure and not tgisinternal) then
    raise exception 'f_a1_usage tail: llm_usage_events is missing its append-only trigger' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='clara.llm_usage_events'::regclass
      and tgfoid='clara._tf_no_truncate()'::regprocedure and not tgisinternal) then
    raise exception 'f_a1_usage tail: llm_usage_events is missing its no-truncate trigger' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.role_table_grants
      where table_schema='clara' and table_name='llm_usage_events'
        and grantee='clara_authenticated' and privilege_type='SELECT') then
    raise exception 'f_a1_usage tail: clara_authenticated is not granted SELECT on llm_usage_events' using errcode='CLR10';
  end if;

  if to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is null then
    raise exception 'f_a1_usage tail: clara.record_llm_usage_event did not install' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid='clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)'::regprocedure
        and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_usage tail: record_llm_usage_event is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)'::regprocedure
        and a.grantee='clara_runtime'::regrole and a.privilege_type='EXECUTE') then
    raise exception 'f_a1_usage tail: record_llm_usage_event is not EXECUTE-granted to clara_runtime' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where f.oid='clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)'::regprocedure
        and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'f_a1_usage tail: PUBLIC executes record_llm_usage_event' using errcode='CLR10';
  end if;

  raise notice 'f_a1_usage tail: OK -- llm_usage_events installed (forced RLS, 2 policies, append-only + no-truncate triggers, clara_authenticated SELECT); record_llm_usage_event installed (definer, search_path pinned, EXECUTE to clara_runtime only, no PUBLIC, no spend refusal). No table in workflow/graphile_worker/spike touched; no D1 quiesce needed (pure addition).';
end
$tail$;
