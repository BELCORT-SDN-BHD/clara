-- FS-4 checkout gate, PR C-1: durable DPA documents/signatures and the checkout-intent
-- version pin. This file is deliberately UNNUMBERED; its migration number is claimed only at
-- merge. C-1 creates no human door and grants no application role direct table access.
--
-- Design reconciliation (2026-08-31): the build order deliberately moves checkout_intents and
-- uq_frr_id_applicant from the design packet's original C-3 split into C-1. It also requires the
-- beta document body and body_sha256 to be seeded together. The part-2 table sketch omitted the
-- body column even though part 3 requires /signup to read that body and hash it. This cohort stores
-- the exact body, pins its digest structurally, and records that reconciliation in the PR.
--
-- The beta text is a conspicuous legal-review placeholder, not a hidden product representation.
-- A reviewed replacement is a version bump: close the current row by effective_to and insert a
-- new immutable version/body/hash row. Existing signatures and checkout intents retain their old
-- version pins. No schema edit is needed for that replacement.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE: refuse a partial cohort, pin every pre-existing object this file is allowed to
-- extend, and take byte-shape evidence for W-E3 before the first write.
-- ==============================================================================================
create temp table _fs4c1_prestate (
  k text primary key,
  v jsonb not null
) on commit drop;

do $pre$
declare
  v_names text;
  v_n integer;
  v_sha text;
begin
  if to_regclass('clara.users') is null
     or to_regclass('clara.firm_registration_requests') is null
     or to_regclass('clara.firm_admissions') is null then
    raise exception 'checkout C-1 prestate: required registration/user relations are absent'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname in ('_tf_append_only','_tf_no_truncate');
  if v_n <> 2 then
    raise exception 'checkout C-1 prestate: generic append/no-truncate guards are absent'
      using errcode = 'CLR10';
  end if;

  select coalesce(string_agg(x, ',' order by x), '(none)') into v_names
    from unnest(array['dpa_documents','dpa_signatures','registration_rate_events','checkout_intents']) x
   where to_regclass('clara.' || x) is not null;
  if v_names <> '(none)' then
    raise exception 'checkout C-1 prestate: cohort must be wholly absent; found %', v_names
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid='clara.firm_registration_requests'::regclass
       and conname='uq_frr_id_applicant'
  ) then
    raise exception 'checkout C-1 prestate: uq_frr_id_applicant already exists without its cohort'
      using errcode = 'CLR10';
  end if;

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.firm_registration_requests'::regclass
     and attnum>0 and not attisdropped;
  if v_names is distinct from
     'id,applicant,firm_name,note,op_key,status,decided_by,decided_at,reason,firm_id,created_at' then
    raise exception 'checkout C-1 prestate: unexpected firm_registration_requests columns: %', v_names
      using errcode = 'CLR10';
  end if;
  insert into _fs4c1_prestate values ('registration_columns',to_jsonb(v_names));

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.firm_admissions'::regclass
     and attnum>0 and not attisdropped;
  -- 0147 dropped the old token and added id/token_hash at attnums 7/8; preserve the catalog's
  -- physical order exactly (checkout-gate-survey §3.1), not the prose-friendly display order.
  if v_names is distinct from
     'note,consumed_at,created_at,consumed_op_key,consumed_result,id,token_hash' then
    raise exception 'checkout C-1 prestate W-E3: unexpected firm_admissions columns: %', v_names
      using errcode = 'CLR10';
  end if;
  insert into _fs4c1_prestate values ('admission_columns',to_jsonb(v_names));

  insert into _fs4c1_prestate
  select 'admission_indexes', coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid), '[]'::jsonb)
    from pg_index where indrelid='clara.firm_admissions'::regclass;
  insert into _fs4c1_prestate
  select 'admission_rows', to_jsonb(count(*)) from clara.firm_admissions;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara.create_firm(text,uuid,text)'::regprocedure;
  if left(v_sha,12) is distinct from '59fa533d9c03' then
    raise exception 'checkout C-1 prestate W-E3: create_firm body moved: %', coalesce(left(v_sha,12),'(gone)')
      using errcode = 'CLR10';
  end if;
  insert into _fs4c1_prestate values ('create_firm_sha',to_jsonb(v_sha));
end $pre$;

set role clara_fn_owner;

-- The composite registration/applicant identity is the M8 FK target. The primary key already
-- makes id unique; this redundant composite key proves that the applicant on an intent is the
-- applicant on the referenced registration, rather than trusting a copied UUID.
alter table clara.firm_registration_requests
  add constraint uq_frr_id_applicant unique (id,applicant);

-- ==============================================================================================
-- 1. VERSIONED DPA DOCUMENTS. The authoritative body is stored, its digest is DB-recomputed by a
-- CHECK, and only effective_to NULL -> non-NULL is mutable. The partial unique index admits one
-- current version. Old bytes can never be rewritten or deleted.
-- ==============================================================================================
create table clara.dpa_documents (
  version        text        primary key check (btrim(version) <> ''),
  body           text        not null check (btrim(body) <> ''),
  body_sha256    bytea       not null,
  source_path    text        not null check (btrim(source_path) <> ''),
  effective_from timestamptz not null,
  effective_to   timestamptz,
  created_at     timestamptz not null default now(),
  constraint ck_dpa_documents_sha_bytes check (octet_length(body_sha256)=32),
  constraint ck_dpa_documents_body_sha check (body_sha256=sha256(convert_to(body,'UTF8'))),
  constraint ck_dpa_documents_effective_range check (effective_to is null or effective_to>effective_from),
  constraint uq_dpa_documents_version_sha unique (version,body_sha256)
);
create unique index uq_dpa_documents_current on clara.dpa_documents ((true))
  where effective_to is null;

alter table clara.dpa_documents enable row level security;
alter table clara.dpa_documents force row level security;
create policy p_dpa_documents_owner on clara.dpa_documents for all to clara_fn_owner
  using (true) with check (true);

create function clara._tf_dpa_documents_supersede_only() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if old.effective_to is not null
     or new.effective_to is null
     or new.effective_to <= old.effective_from
     or row(new.version,new.body,new.body_sha256,new.source_path,new.effective_from,new.created_at)
        is distinct from
        row(old.version,old.body,old.body_sha256,old.source_path,old.effective_from,old.created_at) then
    raise exception 'dpa_documents permits only first effective_to stamp; publish changed text as a new version'
      using errcode='CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_dpa_documents_supersede_only() from public;

create trigger t_dpa_documents_supersede_only before update on clara.dpa_documents
  for each row execute function clara._tf_dpa_documents_supersede_only();
create trigger t_dpa_documents_append_only before delete on clara.dpa_documents
  for each row execute function clara._tf_append_only();
create trigger t_dpa_documents_no_truncate before truncate on clara.dpa_documents
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 2. SIGNATURE EVIDENCE. The composite FK binds the exact document bytes, not just a spelling of
-- its version. Evidence is append-only and one row per (user,version).
-- ==============================================================================================
create table clara.dpa_signatures (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references clara.users(id),
  dpa_version   text        not null,
  signed_at     timestamptz not null default now(),
  body_sha256   bytea       not null,
  constraint ck_dpa_signatures_sha_bytes check (octet_length(body_sha256)=32),
  constraint uq_dpa_signatures_user_version unique (user_id,dpa_version),
  constraint fk_dpa_signatures_document foreign key (dpa_version,body_sha256)
    references clara.dpa_documents(version,body_sha256)
);

alter table clara.dpa_signatures enable row level security;
alter table clara.dpa_signatures force row level security;
create policy p_dpa_signatures_owner on clara.dpa_signatures for all to clara_fn_owner
  using (true) with check (true);

create trigger t_dpa_signatures_append_only before update or delete on clara.dpa_signatures
  for each row execute function clara._tf_append_only();
create trigger t_dpa_signatures_no_truncate before truncate on clara.dpa_signatures
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 3. REGISTRATION RATE EVENTS. C-1 lays down the append-only, privacy-preserving event substrate;
-- the later open_checkout_intent door owns the rate judgement. Only the peppered digest reaches
-- this table, never the originating address.
-- ==============================================================================================
create table clara.registration_rate_events (
  id            uuid        primary key default gen_random_uuid(),
  applicant     uuid        not null references clara.users(id),
  origin_digest bytea       not null,
  observed_at   timestamptz not null default now(),
  constraint ck_registration_rate_events_origin_digest
    check (octet_length(origin_digest)=32)
);
create index ix_registration_rate_events_origin_observed
  on clara.registration_rate_events(origin_digest,observed_at desc);

alter table clara.registration_rate_events enable row level security;
alter table clara.registration_rate_events force row level security;
create policy p_registration_rate_events_owner on clara.registration_rate_events for all to clara_fn_owner
  using (true) with check (true);

create trigger t_registration_rate_events_append_only before update or delete on clara.registration_rate_events
  for each row execute function clara._tf_append_only();
create trigger t_registration_rate_events_no_truncate before truncate on clara.registration_rate_events
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 4. CHECKOUT INTENTS. The row pins the registration/applicant pair and the DPA version seen at
-- open time. Until the later checkout door lands, the sole permitted mutation is session_id's
-- first NULL -> nonblank stamp. The transition trigger is the authority for that judgement.
-- ==============================================================================================
create table clara.checkout_intents (
  id              uuid        primary key default gen_random_uuid(),
  registration_id uuid        not null,
  applicant       uuid        not null,
  price_local_key text        not null check (btrim(price_local_key)<>''),
  dpa_version     text        not null references clara.dpa_documents(version),
  session_id      text        check (session_id is null or btrim(session_id)<>''),
  opened_at       timestamptz not null default now(),
  constraint uq_checkout_intents_session_id unique (session_id),
  constraint fk_checkout_intents_registration_applicant
    foreign key (registration_id,applicant)
    references clara.firm_registration_requests(id,applicant)
);

alter table clara.checkout_intents enable row level security;
alter table clara.checkout_intents force row level security;
create policy p_checkout_intents_owner on clara.checkout_intents for all to clara_fn_owner
  using (true) with check (true);

create function clara._tf_checkout_intents_session_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if old.session_id is not null
     or new.session_id is null
     or btrim(new.session_id)=''
     or row(new.id,new.registration_id,new.applicant,new.price_local_key,new.dpa_version,new.opened_at)
        is distinct from
        row(old.id,old.registration_id,old.applicant,old.price_local_key,old.dpa_version,old.opened_at) then
    raise exception 'checkout_intents permits only the first session_id stamp'
      using errcode='CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_checkout_intents_session_stamp() from public;

create trigger t_checkout_intents_session_stamp before update on clara.checkout_intents
  for each row execute function clara._tf_checkout_intents_session_stamp();
create trigger t_checkout_intents_append_only before delete on clara.checkout_intents
  for each row execute function clara._tf_append_only();
create trigger t_checkout_intents_no_truncate before truncate on clara.checkout_intents
  for each statement execute function clara._tf_no_truncate();

-- 裁-90 beta seed. This is the mechanism and placeholder row delegated to C-1; legal's reviewed
-- body will publish as a new version. The DB derives the stored digest from the exact body bytes.
insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
values (
  'clara-beta-2026-08-a',
  'This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.',
  sha256(convert_to('This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.','UTF8')),
  'docs/ops/legal/clara-beta-dpa.md',
  timestamptz '2026-08-31 00:00:00+08'
);

reset role;

-- ==============================================================================================
-- 5. FAIL-CLOSED TAIL: positive catalog reads, no-app-grant census, exact seed/hash proof, and
-- W-E3 before/after identity. A notice is emitted only after every assertion passes.
-- ==============================================================================================
do $tail$
declare
  v_names text;
  v_n integer;
  v_pre jsonb;
  v_post jsonb;
  v_sha text;
  v_table text;
begin
  select string_agg(c.relname,',' order by c.relname) into v_names
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname in ('dpa_documents','dpa_signatures','registration_rate_events','checkout_intents')
     and c.relkind='r';
  if v_names is distinct from 'checkout_intents,dpa_documents,dpa_signatures,registration_rate_events' then
    raise exception 'checkout C-1 tail: table cohort is not exact: %', coalesce(v_names,'(none)')
      using errcode='CLR10';
  end if;

  foreach v_table in array array['dpa_documents','dpa_signatures','registration_rate_events','checkout_intents'] loop
    select count(*) into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_table and c.relrowsecurity
       and c.relforcerowsecurity and pg_get_userbyid(c.relowner)='clara_fn_owner';
    if v_n<>1 then
      raise exception 'checkout C-1 tail: %. forced-RLS/owner posture is wrong', v_table
        using errcode='CLR10';
    end if;
    select count(*) into v_n
      from pg_policy p
     where p.polrelid=('clara.'||v_table)::regclass
       and p.polname='p_'||v_table||'_owner'
       and p.polcmd='*'
       and p.polroles=array['clara_fn_owner'::regrole::oid]
       and pg_get_expr(p.polqual,p.polrelid)='true'
       and pg_get_expr(p.polwithcheck,p.polrelid)='true';
    if v_n<>1 or (select count(*) from pg_policy where polrelid=('clara.'||v_table)::regclass)<>1 then
      raise exception 'checkout C-1 tail: %. owner-only policy is not exact', v_table
        using errcode='CLR10';
    end if;
  end loop;

  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema='clara'
     and table_name in ('dpa_documents','dpa_signatures','registration_rate_events','checkout_intents')
     and grantee<>'clara_fn_owner';
  if v_n<>0 then
    raise exception 'checkout C-1 tail: % non-owner direct table grant(s) exist', v_n
      using errcode='CLR10';
  end if;

  select count(*) into v_n from clara.dpa_documents
   where version='clara-beta-2026-08-a'
     and body='This is Clara''s beta data-processing agreement, pending review by the owner''s lawyer before launch.'
     and source_path='docs/ops/legal/clara-beta-dpa.md'
     and effective_from=timestamptz '2026-08-31 00:00:00+08'
     and effective_to is null
     and octet_length(body_sha256)=32
     and body_sha256=sha256(convert_to(body,'UTF8'));
  if v_n<>1 or (select count(*) from clara.dpa_documents)<>1 then
    raise exception 'checkout C-1 tail: exact beta document/body/hash row was not positively read'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.firm_registration_requests'::regclass
     and conname='uq_frr_id_applicant' and contype='u' and convalidated
     and (select array_agg(a.attname::text order by k.ord)
            from unnest(conkey) with ordinality k(attnum,ord)
            join pg_attribute a on a.attrelid=conrelid and a.attnum=k.attnum)=array['id','applicant'];
  if v_n<>1 then
    raise exception 'checkout C-1 tail: uq_frr_id_applicant is absent or has the wrong property'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.dpa_signatures'::regclass
     and conname='fk_dpa_signatures_document' and contype='f' and convalidated;
  if v_n<>1 then
    raise exception 'checkout C-1 tail: exact signature document/hash FK was not positively read'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid='clara.checkout_intents'::regclass
     and conname='fk_checkout_intents_registration_applicant' and contype='f' and convalidated;
  if v_n<>1 then
    raise exception 'checkout C-1 tail: exact checkout registration/applicant FK was not positively read'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid='clara.checkout_intents'::regclass
     and conname='uq_checkout_intents_session_id' and contype='u' and convalidated;
  if v_n<>1 then
    raise exception 'checkout C-1 tail: checkout session uniqueness was not positively read'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_index i
   where i.indrelid='clara.registration_rate_events'::regclass
     and not i.indisunique and i.indisvalid and i.indisready and i.indislive
     and pg_get_indexdef(i.indexrelid) like
       '%(origin_digest, observed_at DESC)';
  if v_n<>1 then
    raise exception 'checkout C-1 tail: registration rate digest/time index was not positively read by property'
      using errcode='CLR10';
  end if;

  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.firm_registration_requests'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c1_prestate where k='registration_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-1 tail: registration columns moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;

  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.firm_admissions'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c1_prestate where k='admission_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-1 tail W-E3: firm_admissions columns moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;
  select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid),'[]'::jsonb) into v_post
    from pg_index where indrelid='clara.firm_admissions'::regclass;
  select v into v_pre from _fs4c1_prestate where k='admission_indexes';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-1 tail W-E3: firm_admissions indexes moved'
      using errcode='CLR10';
  end if;
  select to_jsonb(count(*)) into v_post from clara.firm_admissions;
  select v into v_pre from _fs4c1_prestate where k='admission_rows';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-1 tail W-E3: firm_admissions rows moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara.create_firm(text,uuid,text)'::regprocedure;
  select v #>> '{}' into v_names from _fs4c1_prestate where k='create_firm_sha';
  if v_sha is distinct from v_names or left(v_sha,12)<>'59fa533d9c03' then
    raise exception 'checkout C-1 tail W-E3: create_firm body moved (pre %, post %)',v_names,v_sha
      using errcode='CLR10';
  end if;

  raise notice 'checkout C-1 tail: OK -- immutable versioned DPA body/hash + beta placeholder, append-only signatures and registration-rate digest events, M8 checkout intent version/applicant pins, one-shot session stamp, forced owner-only RLS and zero app table grants. firm_admissions and create_firm are byte-shape untouched. No function body under workflow/graphile_worker/spike was touched. No D1 writer replacement.';
end $tail$;
