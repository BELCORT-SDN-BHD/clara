-- FS-4 checkout gate, PR C-3: the folded paid-registration -> firm transaction, its payment
-- and OTP evidence, the minimal beta billing declaration, and the two tightly confined doors.
-- This file is deliberately UNNUMBERED; its migration number is claimed only at merge.
--
-- C-1 deliberately shipped sign_dpa's storage but deferred the door to this cohort. C-3 heals
-- that acknowledged build-order drift. C-2's apply_stripe_events body is not recut here: the
-- existence of firm_registration_payments activates its already-deployed dynamic positive path.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE. Refuse a partial cohort, pin every prerequisite, and capture W-E3 before writing.
-- ==============================================================================================
create temp table _fs4c3_prestate (
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
     or to_regclass('clara.firms') is null
     or to_regclass('clara.firm_memberships') is null
     or to_regclass('clara.onboarding_plans') is null
     or to_regclass('clara.firm_registration_requests') is null
     or to_regclass('clara.firm_admissions') is null
     or to_regclass('clara.dpa_documents') is null
     or to_regclass('clara.dpa_signatures') is null
     or to_regclass('clara.registration_rate_events') is null
     or to_regclass('clara.checkout_intents') is null
     or to_regclass('clara.stripe_events') is null
     or to_regclass('clara.stripe_event_problems') is null
     or to_regclass('clara.stripe_object_map') is null then
    raise exception 'checkout C-3 prestate: required foundation/C-1/C-2 relations are absent'
      using errcode='CLR10';
  end if;

  if to_regprocedure('clara.jwt_sub()') is null
     or to_regprocedure('clara._jwt_email()') is null
     or to_regprocedure('clara._create_firm_core(uuid,text)') is null
     or to_regprocedure('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)') is null
     or to_regprocedure('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)') is null
     or to_regprocedure('clara.record_stripe_event(text,text,jsonb)') is null
     or to_regprocedure('clara.apply_stripe_events(integer)') is null
     or to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception 'checkout C-3 prestate: required identity/core/event/C-2 functions are absent'
      using errcode='CLR10';
  end if;

  if not exists (select 1 from pg_roles where rolname='clara_fn_owner')
     or not exists (select 1 from pg_roles where rolname='clara_authenticated')
     or not exists (select 1 from pg_roles where rolname='clara_stripe_webhook')
     or not exists (select 1 from pg_roles where rolname='clara_stripe_webhook_login')
     or not exists (select 1 from pg_roles where rolname='postgres') then
    raise exception 'checkout C-3 prestate: required owner/application/C-2/test roles are absent'
      using errcode='CLR10';
  end if;

  select coalesce(string_agg(x,',' order by x),'(none)') into v_names
    from unnest(array['billing_plans','confirmation_attempts','firm_registration_payments']) x
   where to_regclass('clara.'||x) is not null;
  if v_names <> '(none)' then
    raise exception 'checkout C-3 prestate: relation cohort must be wholly absent; found %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('new_relations_absent',to_jsonb(v_names));

  select coalesce(string_agg(p.proname,',' order by p.proname),'(none)') into v_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname in (
     '_tf_confirmation_attempt_settle_stamp','_tf_frp_consumption_stamp',
     'claim_confirmation_attempt','claim_paid_firm','open_checkout_intent',
     'record_checkout_session','settle_confirmation_attempt','sign_dpa');
  if v_names <> '(none)' then
    raise exception 'checkout C-3 prestate: function cohort must be wholly absent; found %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('new_functions_absent',to_jsonb(v_names));

  select coalesce(string_agg(rolname,',' order by rolname),'(none)') into v_names
    from pg_roles where rolname in ('clara_auth_wall','clara_auth_wall_login');
  if v_names <> '(none)' then
    raise exception 'checkout C-3 prestate: auth-wall roles must be wholly absent; found %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('new_roles_absent',to_jsonb(v_names));

  if exists (select 1 from clara.event_types where name='firm_registration.paid')
     or exists (
       select 1 from clara.trigger_taxonomy
        where event_type='firm_registration.paid'
     ) then
    raise exception 'checkout C-3 prestate: firm_registration.paid is already partly registered'
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('paid_taxonomy_absent','true'::jsonb);

  select count(*)::int into v_n from clara.dpa_documents where effective_to is null;
  if v_n<>1 then
    raise exception 'checkout C-3 prestate: expected exactly one current DPA document, found %',v_n
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('current_dpa_count',to_jsonb(v_n));

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.firm_registration_requests'::regclass
     and attnum>0 and not attisdropped;
  if v_names is distinct from
     'id,applicant,firm_name,note,op_key,status,decided_by,decided_at,reason,firm_id,created_at' then
    raise exception 'checkout C-3 prestate: unexpected firm_registration_requests columns: %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('registration_columns',to_jsonb(v_names));

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.checkout_intents'::regclass
     and attnum>0 and not attisdropped;
  if v_names is distinct from
     'id,registration_id,applicant,price_local_key,dpa_version,session_id,opened_at' then
    raise exception 'checkout C-3 prestate: unexpected checkout_intents columns: %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('checkout_intent_columns',to_jsonb(v_names));

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.firm_admissions'::regclass
     and attnum>0 and not attisdropped;
  if v_names is distinct from
     'note,consumed_at,created_at,consumed_op_key,consumed_result,id,token_hash' then
    raise exception 'checkout C-3 prestate W-E3: unexpected firm_admissions columns: %',v_names
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('admission_columns',to_jsonb(v_names));
  insert into _fs4c3_prestate
  select 'admission_indexes',coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid),'[]'::jsonb)
    from pg_index where indrelid='clara.firm_admissions'::regclass;
  insert into _fs4c3_prestate
  select 'admission_rows',to_jsonb(count(*)) from clara.firm_admissions;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara.create_firm(text,uuid,text)'::regprocedure;
  if left(v_sha,12) is distinct from '59fa533d9c03' then
    raise exception 'checkout C-3 prestate W-E3: create_firm body moved: %',coalesce(left(v_sha,12),'(gone)')
      using errcode='CLR10';
  end if;
  insert into _fs4c3_prestate values ('create_firm_sha',to_jsonb(v_sha));
end $pre$;

-- Cluster roles live outside clara_fn_owner. The membership chain is the C-2 webhook idiom.
do $role_auth_wall$
begin
  if not exists (select 1 from pg_roles where rolname='clara_auth_wall') then
    create role clara_auth_wall nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='clara_auth_wall_login') then
    create role clara_auth_wall_login nologin inherit;
  end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_auth_wall_login' and g.rolname='clara_auth_wall'
  ) then
    grant clara_auth_wall to clara_auth_wall_login;
  end if;
  -- Test-only SET ROLE reachability; no password-bearing credential is created.
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_auth_wall_login'
  ) then
    grant clara_auth_wall_login to postgres;
  end if;
end $role_auth_wall$;

set role clara_fn_owner;

grant usage on schema clara to clara_auth_wall;

-- ==============================================================================================
-- 1. MINIMAL G2 BILLING DECLARATION. Billing PR-1 owns later rotation/widening.
-- ==============================================================================================
create table clara.billing_plans (
  id            uuid        primary key default gen_random_uuid(),
  local_key     text        not null unique check (btrim(local_key)<>''),
  name          text        not null check (btrim(name)<>''),
  amount_cents  bigint      not null default 0 check (amount_cents>=0),
  currency      text        not null default 'MYR'
    check (currency=upper(currency) and length(currency)=3),
  amounts_ruled boolean     not null default false,
  is_current    boolean     not null default true,
  created_at    timestamptz not null default now()
);
create unique index uq_billing_plans_current on clara.billing_plans ((true)) where is_current;
alter table clara.billing_plans enable row level security;
alter table clara.billing_plans force row level security;
create policy p_billing_plans_owner on clara.billing_plans for all to clara_fn_owner
  using (true) with check (true);

insert into clara.billing_plans(local_key,name,amount_cents,currency,amounts_ruled,is_current)
values ('clara-beta-2026','Clara Beta',0,'MYR',false,true);

-- ==============================================================================================
-- 2. PAYMENT EVIDENCE. Exactly TWO uniqueness mechanisms: stripe_event_id and registration_id.
-- ==============================================================================================
create table clara.firm_registration_payments (
  id                     uuid        primary key default gen_random_uuid(),
  registration_id        uuid        not null,
  applicant              uuid        not null,
  stripe_event_id        text        not null unique references clara.stripe_events(event_id),
  stripe_session_id      text        not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  recorded_at            timestamptz not null default now(),
  consumed_at            timestamptz,
  consumed_firm_id       uuid        references clara.firms(id),
  consumed_dpa_signature uuid        references clara.dpa_signatures(id),
  constraint fk_frp_registration_applicant foreign key (registration_id,applicant)
    references clara.firm_registration_requests(id,applicant),
  constraint ck_frp_consumed_all_or_none check (
    (consumed_at is null and consumed_firm_id is null and consumed_dpa_signature is null)
    or
    (consumed_at is not null and consumed_firm_id is not null and consumed_dpa_signature is not null)
  )
);
create unique index uq_frp_registration
  on clara.firm_registration_payments(registration_id);
alter table clara.firm_registration_payments enable row level security;
alter table clara.firm_registration_payments force row level security;
create policy p_firm_registration_payments_owner on clara.firm_registration_payments
  for all to clara_fn_owner using (true) with check (true);

create function clara._tf_frp_consumption_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if old.consumed_at is not null
     or old.consumed_firm_id is not null
     or old.consumed_dpa_signature is not null
     or new.consumed_at is null
     or new.consumed_firm_id is null
     or new.consumed_dpa_signature is null
     or row(new.id,new.registration_id,new.applicant,new.stripe_event_id,new.stripe_session_id,
            new.stripe_customer_id,new.stripe_subscription_id,new.recorded_at)
        is distinct from
        row(old.id,old.registration_id,old.applicant,old.stripe_event_id,old.stripe_session_id,
            old.stripe_customer_id,old.stripe_subscription_id,old.recorded_at) then
    raise exception 'payment evidence permits only the first complete consumption stamp'
      using errcode='CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_frp_consumption_stamp() from public;

create trigger t_frp_consumption_stamp before update on clara.firm_registration_payments
  for each row execute function clara._tf_frp_consumption_stamp();
create trigger t_frp_append_only before delete on clara.firm_registration_payments
  for each row execute function clara._tf_append_only();
create trigger t_frp_no_truncate before truncate on clara.firm_registration_payments
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 3. OTP ATTEMPTS. An unsettled attempt remains chargeable to both independent windows.
-- ==============================================================================================
create table clara.confirmation_attempts (
  id            uuid        primary key default gen_random_uuid(),
  email_digest  bytea       not null check (octet_length(email_digest)=32),
  origin_digest bytea       not null check (octet_length(origin_digest)=32),
  outcome       text,
  attempted_at  timestamptz not null default now(),
  settled_at    timestamptz,
  constraint ck_confirmation_attempt_outcome check (
    (outcome is null and settled_at is null)
    or (outcome in ('accepted','rejected') and settled_at is not null)
  )
);
create index ix_confirmation_attempts_email_attempted
  on clara.confirmation_attempts(email_digest,attempted_at desc);
create index ix_confirmation_attempts_origin_attempted
  on clara.confirmation_attempts(origin_digest,attempted_at desc);
alter table clara.confirmation_attempts enable row level security;
alter table clara.confirmation_attempts force row level security;
create policy p_confirmation_attempts_owner on clara.confirmation_attempts
  for all to clara_fn_owner using (true) with check (true);

create function clara._tf_confirmation_attempt_settle_stamp() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if old.outcome is not null
     or old.settled_at is not null
     or new.outcome not in ('accepted','rejected')
     or new.settled_at is null
     or row(new.id,new.email_digest,new.origin_digest,new.attempted_at)
        is distinct from row(old.id,old.email_digest,old.origin_digest,old.attempted_at) then
    raise exception 'confirmation_attempts permits only the first complete settlement stamp'
      using errcode='CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_confirmation_attempt_settle_stamp() from public;

create trigger t_confirmation_attempt_settle_stamp before update on clara.confirmation_attempts
  for each row execute function clara._tf_confirmation_attempt_settle_stamp();
create trigger t_confirmation_attempts_append_only before delete on clara.confirmation_attempts
  for each row execute function clara._tf_append_only();
create trigger t_confirmation_attempts_no_truncate before truncate on clara.confirmation_attempts
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 4. HUMAN DOORS. Pre-firm idempotency is structural; no firm-scoped op_receipt can exist yet.
-- ==============================================================================================
create function clara.sign_dpa(p_version text,p_body_sha256 bytea,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_doc clara.dpa_documents%rowtype;
  v_signature uuid;
  v_signed_at timestamptz;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot sign a data processing agreement' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select d.* into v_doc from clara.dpa_documents d where d.version=p_version;
  if not found then
    raise exception 'unknown dpa version' using errcode='CLR10';
  end if;
  if v_doc.effective_to is not null then
    raise exception 'that dpa version is not current' using errcode='CLR09';
  end if;
  if p_body_sha256 is distinct from v_doc.body_sha256 then
    raise exception 'the signed text does not match the current agreement' using errcode='CLR10';
  end if;

  insert into clara.dpa_signatures(user_id,dpa_version,body_sha256)
  values (v_actor,v_doc.version,v_doc.body_sha256)
  on conflict (user_id,dpa_version) do nothing
  returning id,signed_at into v_signature,v_signed_at;
  if found then
    return jsonb_build_object('signature_id',v_signature,'signed_at',v_signed_at);
  end if;
  select s.id,s.signed_at into v_signature,v_signed_at
    from clara.dpa_signatures s
   where s.user_id=v_actor and s.dpa_version=v_doc.version;
  return jsonb_build_object('signature_id',v_signature,'signed_at',v_signed_at,'replay',true);
end $$;
revoke all on function clara.sign_dpa(text,bytea,text) from public;
grant execute on function clara.sign_dpa(text,bytea,text) to clara_authenticated;

create function clara.open_checkout_intent(
  p_registration uuid,p_origin_digest bytea,p_op_key text
) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_req clara.firm_registration_requests%rowtype;
  v_dpa_version text;
  v_price_local_key text;
  v_stripe_price_id text;
  v_intent uuid;
  v_already_paid boolean;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  if v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  select d.version into v_dpa_version
    from clara.dpa_documents d
    join clara.dpa_signatures s on s.dpa_version=d.version and s.body_sha256=d.body_sha256
   where d.effective_to is null and s.user_id=v_actor;
  if not found then
    raise exception 'the data processing agreement is not signed' using errcode='CLR09';
  end if;
  if p_origin_digest is null or octet_length(p_origin_digest)<>32 then
    raise exception 'an origin digest is required' using errcode='CLR10';
  end if;
  -- The rolling-window read and evidence append are one linearized act per digest. A hash
  -- collision only over-serializes unrelated origins; it can never weaken the wall.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'clara.checkout-origin:'||pg_catalog.encode(p_origin_digest,'hex'),0));
  if exists (
    select 1 from clara.registration_rate_events e
     where e.origin_digest=p_origin_digest
       and e.observed_at>=now()-interval '24 hours'
       and e.applicant<>v_actor
  ) then
    raise exception 'too many firm registrations from this location today' using errcode='CLR09';
  end if;
  -- X10 needs a real, honest read of firm_registration_payments -- this door is a genuine
  -- fourth reader of the payments table (a read-only existence probe, never a writer). The part
  -- 3 non-wall census this train inherited was written for the two-door era, before X10 existed
  -- as a wall on the OPENING door at all; this PR widens the expected set to four in the census
  -- cell itself and says so, rather than splitting the identifier to dodge the count -- hiding a
  -- real dependency from a catalog census on a money surface is the wrong kind of clever.
  select exists (
    select 1 from clara.firm_registration_payments p
     where p.registration_id=p_registration and p.consumed_at is null
  ) into v_already_paid;
  if v_already_paid then
    raise exception 'this registration is already paid' using errcode='CLR09';
  end if;

  select b.local_key into v_price_local_key
    from clara.billing_plans b where b.is_current;
  if not found then
    raise exception 'no current billing plan is configured' using errcode='CLR10';
  end if;
  select m.stripe_id into v_stripe_price_id
    from clara.stripe_object_map m
   where m.object_kind='price' and m.local_key=v_price_local_key;
  if not found then
    raise exception 'no stripe price is mapped for this plan' using errcode='CLR10';
  end if;

  insert into clara.registration_rate_events(applicant,origin_digest)
  values (v_actor,p_origin_digest);
  insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
  values (p_registration,v_actor,v_price_local_key,v_dpa_version)
  returning id into v_intent;
  return jsonb_build_object(
    'intent_id',v_intent,'price_local_key',v_price_local_key,'stripe_price_id',v_stripe_price_id);
end $$;
revoke all on function clara.open_checkout_intent(uuid,bytea,text) from public;
grant execute on function clara.open_checkout_intent(uuid,bytea,text) to clara_authenticated;

create function clara.record_checkout_session(p_intent uuid,p_session_id text,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_intent clara.checkout_intents%rowtype;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot record a checkout session' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- Serialize the stamp decision itself. A concurrent caller wakes onto the committed value and
  -- therefore takes the exact replay/different-value branch instead of reaching C-1's trigger on
  -- a stale NULL snapshot. Ownership is still proved before any UPDATE is attempted (W-S/M2).
  select i.* into v_intent from clara.checkout_intents i where i.id=p_intent for update;
  if not found then
    raise exception 'unknown checkout intent' using errcode='CLR10';
  end if;
  if v_intent.applicant is distinct from v_actor then
    raise exception 'not your checkout intent' using errcode='CLR04';
  end if;
  if v_intent.session_id is not null then
    if v_intent.session_id is not distinct from p_session_id then
      return jsonb_build_object('intent_id',p_intent,'recorded',true,'replay',true);
    end if;
    raise exception 'checkout session already recorded' using errcode='CLR09';
  end if;
  if nullif(btrim(p_session_id),'') is null then
    raise exception 'checkout session id is required' using errcode='CLR10';
  end if;
  update clara.checkout_intents set session_id=p_session_id where id=p_intent;
  return jsonb_build_object('intent_id',p_intent,'recorded',true);
end $$;
revoke all on function clara.record_checkout_session(uuid,text,text) from public;
grant execute on function clara.record_checkout_session(uuid,text,text) to clara_authenticated;

-- The unlocked probe gives settled later retries a receipt. The locked re-read deliberately has
-- no replay carve-out: a concurrent loser wakes onto W7 and raises CLR09 (W-K).
create function clara.claim_paid_firm(p_registration uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
  v_is_agent boolean;
  v_email text;
  v_req clara.firm_registration_requests%rowtype;
  v_plan uuid;
  v_payment uuid;
  v_payment_session text;
  v_dpa_version text;
  v_signature uuid;
  v_result jsonb;
  v_firm uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id=v_actor;
  if not found then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if v_is_agent then
    raise exception 'the agent identity cannot claim a firm' using errcode='CLR04';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select r.* into v_req from clara.firm_registration_requests r where r.id=p_registration;
  if not found then
    raise exception 'unknown registration request' using errcode='CLR10';
  end if;
  if v_req.applicant is distinct from v_actor then
    raise exception 'not your registration request' using errcode='CLR04';
  end if;
  v_email:=clara._jwt_email();
  if v_email is null then
    raise exception 'a verified email claim is required' using errcode='CLR04';
  end if;

  if v_req.firm_id is not null then
    select p.id into v_plan from clara.onboarding_plans p
     where p.firm_id=v_req.firm_id and p.scope_kind='firm';
    if not found then
      raise exception 'the registration firm has no onboarding plan' using errcode='CLR10';
    end if;
    return jsonb_build_object(
      'firm_id',v_req.firm_id,'plan_id',v_plan,'registration_id',p_registration,'replay',true);
  end if;

  select r.* into v_req
    from clara.firm_registration_requests r
   where r.id=p_registration
   for update;
  if v_req.firm_id is not null or v_req.status<>'open' then
    raise exception 'this registration is no longer open (status: %)',v_req.status using errcode='CLR09';
  end if;

  select p.id,p.stripe_session_id into v_payment,v_payment_session
    from clara.firm_registration_payments p
   where p.registration_id=p_registration and p.consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;
  select i.dpa_version into v_dpa_version
    from clara.checkout_intents i where i.session_id=v_payment_session;
  if not found then
    raise exception 'the data processing agreement is not signed' using errcode='CLR09';
  end if;
  select s.id into v_signature
    from clara.dpa_signatures s
   where s.user_id=v_actor and s.dpa_version=v_dpa_version;
  if not found then
    raise exception 'the data processing agreement is not signed' using errcode='CLR09';
  end if;

  v_result:=clara._create_firm_core(v_actor,v_req.firm_name);
  v_firm:=(v_result->>'firm_id')::uuid;
  update clara.firm_registration_requests
     set status='approved',decided_at=now(),firm_id=v_firm
   where id=p_registration;
  update clara.firm_registration_payments
     set consumed_at=now(),consumed_firm_id=v_firm,consumed_dpa_signature=v_signature
   where id=v_payment and consumed_at is null;
  if not found then
    raise exception 'no completed payment for this registration' using errcode='CLR09';
  end if;

  perform clara._audit(
    v_firm,v_actor,null,null,'claim_paid_firm',null,
    jsonb_build_object('registration_id',p_registration,'plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm.created',null,v_actor,null,null,null,null,null,
    jsonb_build_object('plan_id',v_result->>'plan_id'));
  perform clara._append_event(
    v_firm,'firm_registration.paid',null,v_actor,null,null,null,null,null,
    jsonb_build_object('registration_id',p_registration,'payment_id',v_payment));
  return jsonb_build_object(
    'firm_id',v_result->>'firm_id','plan_id',v_result->>'plan_id','registration_id',p_registration);
end $$;
revoke all on function clara.claim_paid_firm(uuid,text) from public;
grant execute on function clara.claim_paid_firm(uuid,text) to clara_authenticated;

-- ==============================================================================================
-- 5. PRE-SESSION AUTH-WALL DOORS. The claim always persists before the window is evaluated.
-- ==============================================================================================
create function clara.claim_confirmation_attempt(p_email_digest bytea,p_origin_digest bytea)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_attempt uuid;
  v_attempted_at timestamptz;
  v_email_count integer;
  v_origin_count integer;
  v_allowed boolean;
  v_remaining integer;
  v_email_lock bigint;
  v_origin_lock bigint;
  v_scope text;
  v_retry_after integer;
begin
  if p_email_digest is null or octet_length(p_email_digest)<>32
     or p_origin_digest is null or octet_length(p_origin_digest)<>32 then
    raise exception 'a digest is required' using errcode='CLR10';
  end if;
  -- Serialize both independent limbs, always in numeric order. The locks precede the evidence
  -- append, but the row still lands before either window is evaluated as the contract requires.
  -- A 64-bit hash collision is fail-safe: it serializes extra callers instead of admitting one.
  v_email_lock:=pg_catalog.hashtextextended(
    'clara.confirm-email:'||pg_catalog.encode(p_email_digest,'hex'),0);
  v_origin_lock:=pg_catalog.hashtextextended(
    'clara.confirm-origin:'||pg_catalog.encode(p_origin_digest,'hex'),0);
  if v_email_lock<=v_origin_lock then
    perform pg_catalog.pg_advisory_xact_lock(v_email_lock);
    if v_origin_lock<>v_email_lock then
      perform pg_catalog.pg_advisory_xact_lock(v_origin_lock);
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_origin_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_email_lock);
  end if;
  insert into clara.confirmation_attempts(email_digest,origin_digest)
  values (p_email_digest,p_origin_digest)
  returning id,attempted_at into v_attempt,v_attempted_at;

  select count(*)::int into v_email_count
    from clara.confirmation_attempts a
   where a.id<>v_attempt and a.email_digest=p_email_digest
     and a.attempted_at>=v_attempted_at-interval '15 minutes'
     and a.outcome is distinct from 'accepted';
  select count(*)::int into v_origin_count
    from clara.confirmation_attempts a
   where a.id<>v_attempt and a.origin_digest=p_origin_digest
     and a.attempted_at>=v_attempted_at-interval '15 minutes'
     and a.outcome is distinct from 'accepted';
  v_allowed:=(v_email_count<5 and v_origin_count<5);
  v_remaining:=greatest(0,5-greatest(v_email_count,v_origin_count));

  -- 裁-[#488 seam review]: the refused arm names WHICH wall fired (never left for the caller to
  -- infer from an errcode or message string -- law 3, "spelling is not identity") and how long
  -- until the caller may retry (derived from DB-owned attempt timestamps + the fixed 15-minute
  -- window -- hard constraint 2: the DB owns the number). C1 (email) takes precedence when both
  -- limbs are simultaneously over threshold, matching the design's own C1-then-C2 ordering.
  -- retry_after_seconds is the wait until enough of the counted attempts age out of the window to
  -- drop the count back under 5 -- the (count-4)th-oldest counted attempt's own window expiry,
  -- which generalizes past the exact-5 case to a burst that momentarily counted higher. Both
  -- fields are null on the allowed path -- there is nothing to name or wait for.
  if v_allowed then
    v_scope:=null;
    v_retry_after:=null;
  elsif v_email_count>=5 then
    v_scope:='email';
    select greatest(0,ceil(extract(epoch from
             ((a.attempted_at+interval '15 minutes')-v_attempted_at))))::int
      into v_retry_after
      from clara.confirmation_attempts a
     where a.id<>v_attempt and a.email_digest=p_email_digest
       and a.attempted_at>=v_attempted_at-interval '15 minutes'
       and a.outcome is distinct from 'accepted'
     order by a.attempted_at asc
     offset greatest(v_email_count-5,0) limit 1;
  else
    v_scope:='origin';
    select greatest(0,ceil(extract(epoch from
             ((a.attempted_at+interval '15 minutes')-v_attempted_at))))::int
      into v_retry_after
      from clara.confirmation_attempts a
     where a.id<>v_attempt and a.origin_digest=p_origin_digest
       and a.attempted_at>=v_attempted_at-interval '15 minutes'
       and a.outcome is distinct from 'accepted'
     order by a.attempted_at asc
     offset greatest(v_origin_count-5,0) limit 1;
  end if;

  return jsonb_build_object(
    'attempt_id',v_attempt,'allowed',v_allowed,'remaining',v_remaining,
    'scope',v_scope,'retry_after_seconds',v_retry_after);
end $$;
revoke all on function clara.claim_confirmation_attempt(bytea,bytea) from public;
grant execute on function clara.claim_confirmation_attempt(bytea,bytea) to clara_auth_wall;

create function clara.settle_confirmation_attempt(p_attempt uuid,p_outcome text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_attempt clara.confirmation_attempts%rowtype;
begin
  if p_outcome is null or p_outcome not in ('accepted','rejected') then
    raise exception 'outcome must be accepted or rejected' using errcode='CLR10';
  end if;
  select a.* into v_attempt from clara.confirmation_attempts a where a.id=p_attempt for update;
  if not found then
    raise exception 'unknown confirmation attempt' using errcode='CLR10';
  end if;
  if v_attempt.outcome is not null then
    raise exception 'confirmation attempt already settled' using errcode='CLR09';
  end if;
  update clara.confirmation_attempts
     set outcome=p_outcome,settled_at=now()
   where id=p_attempt;
  return jsonb_build_object('attempt_id',p_attempt,'outcome',p_outcome);
end $$;
revoke all on function clara.settle_confirmation_attempt(uuid,text) from public;
grant execute on function clara.settle_confirmation_attempt(uuid,text) to clara_auth_wall;

-- Exactly one new event type, paired with the active taxonomy row in the same statement chain.
with inserted_types as (
  insert into clara.event_types(name,client_scoped,description) values
    ('firm_registration.paid',false,'A paid registration was claimed through clara.claim_paid_firm')
  on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,i.name,'context_update',null
  from inserted_types i cross join clara.taxonomy_active a;

reset role;

-- ==============================================================================================
-- 6. FAIL-CLOSED TAIL. Every catalog claim is positively reread after privileges are final.
-- ==============================================================================================
do $tail$
declare
  v_names text;
  v_n integer;
  v_table text;
  v_role text;
  v_sig regprocedure;
  v_acl text[];
  v_effective text[];
  v_pre jsonb;
  v_post jsonb;
  v_sha text;
begin
  select string_agg(c.relname,',' order by c.relname) into v_names
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara'
     and c.relname in ('billing_plans','confirmation_attempts','firm_registration_payments')
     and c.relkind='r';
  if v_names is distinct from 'billing_plans,confirmation_attempts,firm_registration_payments' then
    raise exception 'checkout C-3 tail: table cohort is not exact: %',coalesce(v_names,'(none)')
      using errcode='CLR10';
  end if;

  foreach v_table in array array['billing_plans','firm_registration_payments','confirmation_attempts'] loop
    select count(*) into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_table and c.relrowsecurity
       and c.relforcerowsecurity and pg_get_userbyid(c.relowner)='clara_fn_owner';
    if v_n<>1 then
      raise exception 'checkout C-3 tail: %. forced-RLS/owner posture is wrong',v_table
        using errcode='CLR10';
    end if;
    select count(*) into v_n from pg_policy p
     where p.polrelid=('clara.'||v_table)::regclass
       and p.polname='p_'||v_table||'_owner' and p.polcmd='*'
       and p.polroles=array['clara_fn_owner'::regrole::oid]
       and pg_get_expr(p.polqual,p.polrelid)='true'
       and pg_get_expr(p.polwithcheck,p.polrelid)='true';
    if v_n<>1 or (select count(*) from pg_policy where polrelid=('clara.'||v_table)::regclass)<>1 then
      raise exception 'checkout C-3 tail: %. owner-only policy is not exact',v_table
        using errcode='CLR10';
    end if;
  end loop;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   where n.nspname='clara'
     and c.relname in ('billing_plans','confirmation_attempts','firm_registration_payments')
     and a.grantee<>c.relowner;
  if v_n<>0 then
    raise exception 'checkout C-3 tail: % non-owner direct table grant(s) exist',v_n
      using errcode='CLR10';
  end if;

  select count(*) into v_n from clara.billing_plans
   where local_key='clara-beta-2026' and name='Clara Beta' and amount_cents=0
     and currency='MYR' and not amounts_ruled and is_current;
  if v_n<>1 or (select count(*) from clara.billing_plans)<>1 then
    raise exception 'checkout C-3 tail: exact minimal G2 beta billing row was not positively read'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.firm_registration_payments'::regclass
     and contype in ('p','u') and convalidated;
  if v_n<>2 then
    raise exception 'checkout C-3 tail: payment table carries % PK/UNIQUE constraints, expected two',v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_index
   where indrelid='clara.firm_registration_payments'::regclass and indisunique;
  if v_n<>3 then
    raise exception 'checkout C-3 tail: payment table carries % unique indexes including PK, expected three',v_n
      using errcode='CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid='clara.firm_registration_payments'::regclass
       and conname='firm_registration_payments_stripe_event_id_key' and contype='u' and convalidated
  ) or not exists (
    select 1 from pg_index
     where indexrelid='clara.uq_frp_registration'::regclass
       and indrelid='clara.firm_registration_payments'::regclass and indisunique
  ) then
    raise exception 'checkout C-3 tail: exact stripe-event/registration uniqueness pair is absent'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.firm_registration_payments'::regclass
     and conname in ('fk_frp_registration_applicant','ck_frp_consumed_all_or_none') and convalidated;
  if v_n<>2 then
    raise exception 'checkout C-3 tail: payment composite FK/consumption CHECK pair is not exact'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid='clara.confirmation_attempts'::regclass
     and conname='ck_confirmation_attempt_outcome' and contype='c' and convalidated;
  if v_n<>1 then
    raise exception 'checkout C-3 tail: OTP settlement CHECK was not positively read'
      using errcode='CLR10';
  end if;

  foreach v_sig in array array[
    'clara._tf_frp_consumption_stamp()'::regprocedure,
    'clara._tf_confirmation_attempt_settle_stamp()'::regprocedure,
    'clara.sign_dpa(text,bytea,text)'::regprocedure,
    'clara.open_checkout_intent(uuid,bytea,text)'::regprocedure,
    'clara.record_checkout_session(uuid,text,text)'::regprocedure,
    'clara.claim_paid_firm(uuid,text)'::regprocedure,
    'clara.claim_confirmation_attempt(bytea,bytea)'::regprocedure,
    'clara.settle_confirmation_attempt(uuid,text)'::regprocedure
  ] loop
    select count(*) into v_n from pg_proc p
     where p.oid=v_sig and p.prosecdef and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and p.prolang=(select oid from pg_language where lanname='plpgsql')
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n<>1 then
      raise exception 'checkout C-3 tail: function % has wrong owner/definer/language/search_path',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  foreach v_sig in array array[
    'clara.sign_dpa(text,bytea,text)'::regprocedure,
    'clara.open_checkout_intent(uuid,bytea,text)'::regprocedure,
    'clara.record_checkout_session(uuid,text,text)'::regprocedure,
    'clara.claim_paid_firm(uuid,text)'::regprocedure
  ] loop
    select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) into v_acl
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig and a.privilege_type='EXECUTE';
    if v_acl is distinct from array['clara_authenticated','clara_fn_owner'] then
      raise exception 'checkout C-3 tail: human door % ACL is %',v_sig,v_acl using errcode='CLR10';
    end if;
  end loop;

  foreach v_sig in array array[
    'clara.claim_confirmation_attempt(bytea,bytea)'::regprocedure,
    'clara.settle_confirmation_attempt(uuid,text)'::regprocedure
  ] loop
    select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) into v_acl
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig and a.privilege_type='EXECUTE';
    if v_acl is distinct from array['clara_auth_wall','clara_fn_owner'] then
      raise exception 'checkout C-3 tail: auth-wall door % ACL is %',v_sig,v_acl using errcode='CLR10';
    end if;
  end loop;

  foreach v_sig in array array[
    'clara._tf_frp_consumption_stamp()'::regprocedure,
    'clara._tf_confirmation_attempt_settle_stamp()'::regprocedure
  ] loop
    select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) into v_acl
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig and a.privilege_type='EXECUTE';
    if v_acl is distinct from array['clara_fn_owner'] then
      raise exception 'checkout C-3 tail: trigger function % ACL is %',v_sig,v_acl using errcode='CLR10';
    end if;
  end loop;

  foreach v_role in array array['clara_auth_wall','clara_auth_wall_login'] loop
    select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_effective
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and has_function_privilege(v_role,p.oid,'EXECUTE');
    if v_effective is distinct from array[
      'clara.claim_confirmation_attempt(bytea,bytea)',
      'clara.settle_confirmation_attempt(uuid,text)'
    ] then
      raise exception 'checkout C-3 tail: auth-wall effective routine set for % is %',v_role,v_effective
        using errcode='CLR10';
    end if;
    if not has_schema_privilege(v_role,'clara','USAGE') then
      raise exception 'checkout C-3 tail: auth-wall role % cannot reach schema clara',v_role
        using errcode='CLR10';
    end if;
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='clara' and c.relkind in ('r','p','v','m','f')
         and (has_table_privilege(v_role,c.oid,'SELECT')
           or has_table_privilege(v_role,c.oid,'INSERT')
           or has_table_privilege(v_role,c.oid,'UPDATE')
           or has_table_privilege(v_role,c.oid,'DELETE')
           or has_table_privilege(v_role,c.oid,'TRUNCATE')
           or has_table_privilege(v_role,c.oid,'REFERENCES')
           or has_table_privilege(v_role,c.oid,'TRIGGER'))
    ) then
      raise exception 'checkout C-3 tail: auth-wall role % has an effective clara relation privilege',v_role
        using errcode='CLR10';
    end if;
  end loop;

  if not exists (
    select 1 from pg_roles r join pg_auth_members m on m.member=r.oid
    join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_auth_wall_login' and g.rolname='clara_auth_wall'
  ) or not exists (
    select 1 from pg_roles r join pg_auth_members m on m.member=r.oid
    join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_auth_wall_login'
  ) then
    raise exception 'checkout C-3 tail: auth-wall role membership chain is incomplete'
      using errcode='CLR10';
  end if;
  if exists (
    with recursive closure(oid,path) as (
      select oid,array[oid] from pg_roles
       where rolname in ('clara_auth_wall','clara_auth_wall_login')
      union all
      select m.roleid,c.path||m.roleid from closure c
      join pg_auth_members m on m.member=c.oid
      where not m.roleid=any(c.path)
    )
    select 1 from closure c join pg_roles r on r.oid=c.oid
     where r.rolbypassrls or r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication
  ) or exists (
    select 1 from pg_roles
     where rolname in ('clara_auth_wall','clara_auth_wall_login')
       and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb or rolreplication)
  ) then
    raise exception 'checkout C-3 tail: auth-wall role closure reaches login/cluster/superuser/BYPASSRLS'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from clara.event_types
   where name='firm_registration.paid' and not client_scoped
     and description like '%clara.claim_paid_firm%';
  if v_n<>1 then
    raise exception 'checkout C-3 tail: firm_registration.paid event type count is %',v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.trigger_taxonomy t join clara.taxonomy_active a on a.version=t.version
   where t.event_type='firm_registration.paid' and t.decision='context_update';
  if v_n<>1 then
    raise exception 'checkout C-3 tail: active firm_registration.paid taxonomy count is %',v_n
      using errcode='CLR10';
  end if;

  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.firm_registration_requests'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c3_prestate where k='registration_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-3 tail: registration columns moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;
  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.checkout_intents'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c3_prestate where k='checkout_intent_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-3 tail: checkout_intents columns moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;

  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.firm_admissions'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c3_prestate where k='admission_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-3 tail W-E3: firm_admissions columns moved' using errcode='CLR10';
  end if;
  select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid),'[]'::jsonb) into v_post
    from pg_index where indrelid='clara.firm_admissions'::regclass;
  select v into v_pre from _fs4c3_prestate where k='admission_indexes';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-3 tail W-E3: firm_admissions indexes moved' using errcode='CLR10';
  end if;
  select to_jsonb(count(*)) into v_post from clara.firm_admissions;
  select v into v_pre from _fs4c3_prestate where k='admission_rows';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-3 tail W-E3: firm_admissions row count moved' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara.create_firm(text,uuid,text)'::regprocedure;
  select v #>> '{}' into v_names from _fs4c3_prestate where k='create_firm_sha';
  if v_sha is distinct from v_names or left(v_sha,12)<>'59fa533d9c03' then
    raise exception 'checkout C-3 tail W-E3: create_firm body moved (pre %, post %)',v_names,v_sha
      using errcode='CLR10';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='clara' and p.proname='reconcile_paid_registrations') then
    raise exception 'checkout C-3 tail: retired reconcile_paid_registrations exists'
      using errcode='CLR10';
  end if;

  raise notice 'checkout C-3 tail: OK -- minimal G2 billing row; payment evidence with exactly stripe-event + registration uniqueness and one complete consumption stamp; OTP attempts count before verification and settle once; four authenticated doors + exact two-verb auth-wall lane; folded claim calls _create_firm_core and emits firm.created then firm_registration.paid; active taxonomy paired; forced owner-only RLS and zero app table grants; firm_admissions/create_firm untouched; C-2 applier unrecut.';
end $tail$;
