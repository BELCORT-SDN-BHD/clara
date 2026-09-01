-- FS-4 checkout gate, PR C-2: the redacted Stripe projection, reconciliation-problem queue,
-- object map, webhook-only recorder/applier, and operator-only problem controls.
-- Number CLAIMED at merge prep 2026-09-01: 0160, one past the live frontier 0158 (standing
-- law, AGENTS.md + .claude/rules/db-migrations.md); 0159 claimed concurrently by another
-- lane's PR -- the number is comment-only, the body is byte-identical to the reviewed file.
--
-- C-3 forward-reference boundary. The applier intentionally names the future
-- clara.firm_registration_payments relation and uq_frp_registration index, but C-2 does not
-- create either. Consequently this cohort can prove the negative W-M/W-N paths and the problem
-- resolution half of W-M2, but these subjects remain DEFERRED TO C-3: W-B's payment-row limb;
-- W-M/W-N's matching-metadata -> payment positive limbs; W-M2's next-sweep-applies limb; W-O's
-- claim_paid_firm refusal; W-O2; W-T; BLOCKER-4's poison-pill mutant; the payment-row limb of the
-- monotonic census; and part 3 section 5.2's three-function body-reference set equality. C-2
-- neither fabricates those objects nor calls a missing subject a passing test.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE: refuse a partial cohort and positively pin the C-1 surface this cohort consumes.
-- ==============================================================================================
create temp table _fs4c2_prestate (
  k text primary key,
  v jsonb not null
) on commit drop;

do $pre$
declare
  v_names text;
  v_n integer;
begin
  if to_regclass('clara.users') is null
     or to_regclass('clara.firms') is null
     or to_regclass('clara.checkout_intents') is null then
    raise exception 'checkout C-2 prestate: required user/firm/C-1 intent relations are absent'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname in ('_tf_append_only','_tf_no_truncate');
  if v_n <> 2 then
    raise exception 'checkout C-2 prestate: generic append/no-truncate guards are absent'
      using errcode = 'CLR10';
  end if;

  if to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara.role_rank(text)') is null
     or to_regprocedure('clara.jwt_firm()') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._hash(jsonb)') is null then
    raise exception 'checkout C-2 prestate: required identity/idempotency doors are absent'
      using errcode = 'CLR10';
  end if;

  if not exists (select 1 from pg_roles where rolname='clara_fn_owner')
     or not exists (select 1 from pg_roles where rolname='clara_authenticated')
     or not exists (select 1 from pg_roles where rolname='postgres') then
    raise exception 'checkout C-2 prestate: required owner/authenticated/test roles are absent'
      using errcode = 'CLR10';
  end if;

  select coalesce(string_agg(x, ',' order by x), '(none)') into v_names
    from unnest(array['stripe_events','stripe_event_problems','stripe_object_map']) x
   where to_regclass('clara.' || x) is not null;
  if v_names <> '(none)' then
    raise exception 'checkout C-2 prestate: cohort must be wholly absent; found %', v_names
      using errcode = 'CLR10';
  end if;

  if to_regclass('clara.firm_registration_payments') is not null
     or to_regprocedure('clara.claim_paid_firm(uuid,text)') is not null then
    raise exception 'checkout C-2 prestate: a C-3 object exists before its owning cohort'
      using errcode = 'CLR10';
  end if;

  select string_agg(attname,',' order by attnum) into v_names
    from pg_attribute
   where attrelid='clara.checkout_intents'::regclass
     and attnum>0 and not attisdropped;
  if v_names is distinct from
     'id,registration_id,applicant,price_local_key,dpa_version,session_id,opened_at' then
    raise exception 'checkout C-2 prestate: unexpected checkout_intents columns: %', v_names
      using errcode = 'CLR10';
  end if;
  insert into _fs4c2_prestate values ('checkout_intents_columns',to_jsonb(v_names));

  select count(*) into v_n
    from pg_constraint
   where conrelid='clara.checkout_intents'::regclass
     and conname in ('checkout_intents_pkey','uq_checkout_intents_session_id',
                     'fk_checkout_intents_registration_applicant')
     and convalidated;
  if v_n <> 3 then
    raise exception 'checkout C-2 prestate: checkout_intents key/FK cohort is not exact'
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_roles
     where rolname='clara_stripe_webhook'
       and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb
            or rolreplication)
  ) or exists (
    select 1 from pg_roles
     where rolname='clara_stripe_webhook_login'
       and (rolcanlogin or not rolinherit or rolsuper or rolbypassrls or rolcreaterole
            or rolcreatedb or rolreplication)
  ) then
    raise exception 'checkout C-2 prestate: pre-existing webhook role posture is unsafe'
      using errcode = 'CLR10';
  end if;
end $pre$;

-- Cluster roles are created outside clara_fn_owner, following the measured wake-role idiom.
do $role_webhook$
begin
  if not exists (select 1 from pg_roles where rolname='clara_stripe_webhook') then
    create role clara_stripe_webhook nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='clara_stripe_webhook_login') then
    create role clara_stripe_webhook_login nologin inherit;
  end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_stripe_webhook_login' and g.rolname='clara_stripe_webhook'
  ) then
    grant clara_stripe_webhook to clara_stripe_webhook_login;
  end if;
  -- Test-only membership: the throwaway rig's postgres role can SET ROLE into the lane without
  -- any password-bearing credential, exactly like clara_wake_bank_login's precedent.
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_stripe_webhook_login'
  ) then
    grant clara_stripe_webhook_login to postgres;
  end if;
end $role_webhook$;

set role clara_fn_owner;

-- PUBLIC has no USAGE on clara. This schema grant is reachability plumbing; the role's routine
-- surface remains the exact two EXECUTEs asserted below, and it receives zero relation grants.
grant usage on schema clara to clara_stripe_webhook;

-- ==============================================================================================
-- 1. REDACTED STRIPE PROJECTION. The raw event never lands here. No applied_at exists: payment
-- application is derived from C-3's stripe_event_id row, so immutability is unconditional.
-- ==============================================================================================
create table clara.stripe_events (
  event_id       text        primary key,
  type           text        not null,
  livemode       boolean     not null,
  session_id     text,
  intent_id      uuid,
  registration_id uuid,
  applicant      uuid,
  amount_total   bigint,
  currency       text,
  payment_status text,
  mode           text,
  session_status text,
  customer_id    text,
  subscription_id text,
  projection     jsonb       not null default '{}'::jsonb,
  received_at    timestamptz not null default now(),
  constraint ck_stripe_events_event_id_shape check (
    event_id ~ '^evt_[A-Za-z0-9_]+$' and length(event_id)<=255
  ),
  constraint ck_stripe_events_status_shape check (
    (payment_status is null or (length(payment_status)<=64 and payment_status ~ '^[ -~]*$'))
    and (mode is null or (length(mode)<=64 and mode ~ '^[ -~]*$'))
    and (session_status is null or (length(session_status)<=64 and session_status ~ '^[ -~]*$'))
  ),
  constraint ck_stripe_events_no_pii check (
    not (projection ?| array['customer_details','customer_email','billing_details',
                             'shipping_details','payment_method_details'])
  )
);

alter table clara.stripe_events enable row level security;
alter table clara.stripe_events force row level security;
create policy p_stripe_events_owner on clara.stripe_events for all to clara_fn_owner
  using (true) with check (true);

create trigger t_stripe_events_append_only before update or delete on clara.stripe_events
  for each row execute function clara._tf_append_only();
create trigger t_stripe_events_no_truncate before truncate on clara.stripe_events
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 2. PROBLEM QUEUE. Rows are append-only except for one complete resolution stamp.
-- ==============================================================================================
create table clara.stripe_event_problems (
  id            uuid        primary key default gen_random_uuid(),
  event_id      text        not null references clara.stripe_events(event_id),
  problem       text        not null,
  detail        jsonb       not null default '{}'::jsonb,
  noticed_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid        references clara.users(id),
  resolution    text,
  constraint ck_stripe_event_problems_problem check (
    problem in ('payment_not_settled','metadata_missing','intent_not_found',
                'intent_mismatch','duplicate_payment')
  ),
  constraint ck_stripe_event_problems_resolution_stamp check (
    (resolved_at is null and resolved_by is null and resolution is null)
    or
    (resolved_at is not null and resolved_by is not null
     and resolution is not null and btrim(resolution)<>'')
  )
);

create unique index uq_stripe_event_problems_event_open
  on clara.stripe_event_problems(event_id,problem) where resolved_at is null;

alter table clara.stripe_event_problems enable row level security;
alter table clara.stripe_event_problems force row level security;
create policy p_stripe_event_problems_owner on clara.stripe_event_problems for all to clara_fn_owner
  using (true) with check (true);

create function clara._tf_stripe_event_problem_resolve_once() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.resolved_at is not null
     or old.resolved_by is not null
     or old.resolution is not null
     or new.resolved_at is null
     or new.resolved_by is null
     or new.resolution is null
     or btrim(new.resolution)=''
     or row(new.id,new.event_id,new.problem,new.detail,new.noticed_at)
        is distinct from
        row(old.id,old.event_id,old.problem,old.detail,old.noticed_at) then
    raise exception 'stripe_event_problems permits only one complete resolution stamp'
      using errcode='CLR08';
  end if;
  return new;
end $$;
revoke all on function clara._tf_stripe_event_problem_resolve_once() from public;

create trigger t_stripe_event_problems_resolve_once before update on clara.stripe_event_problems
  for each row execute function clara._tf_stripe_event_problem_resolve_once();
create trigger t_stripe_event_problems_append_only before delete on clara.stripe_event_problems
  for each row execute function clara._tf_append_only();
create trigger t_stripe_event_problems_no_truncate before truncate on clara.stripe_event_problems
  for each statement execute function clara._tf_no_truncate();

-- ==============================================================================================
-- 3. STRIPE OBJECT MAP. Stripe-side ids are projections of DB-owned local keys.
-- ==============================================================================================
create table clara.stripe_object_map (
  object_kind text        not null,
  local_key   text        not null,
  stripe_id   text        not null,
  synced_at   timestamptz not null default now(),
  primary key (object_kind,local_key),
  unique (stripe_id)
);

alter table clara.stripe_object_map enable row level security;
alter table clara.stripe_object_map force row level security;
create policy p_stripe_object_map_owner on clara.stripe_object_map for all to clara_fn_owner
  using (true) with check (true);

-- ==============================================================================================
-- 4. WEBHOOK DOORS. The recorder accepts only a redacted object and writes no other relation.
-- The applier validates all C-1 facts before its intentional C-3 forward reference.
-- ==============================================================================================
create function clara.record_stripe_event(
  p_event_id text,
  p_type text,
  p_projection jsonb
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_recorded boolean;
  v_denied_key text;
  v_uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_event_id is null or btrim(p_event_id)=''
     or p_type is null or btrim(p_type)='' then
    raise exception 'event id and type are required' using errcode='CLR10';
  end if;
  if jsonb_typeof(p_projection) is distinct from 'object' then
    raise exception 'projection must be a json object' using errcode='CLR10';
  end if;
  foreach v_denied_key in array array[
    'customer_details','customer_email','billing_details','shipping_details',
    'payment_method_details'
  ] loop
    if p_projection ? v_denied_key then
      raise exception 'projection carries a denied field: %',v_denied_key using errcode='CLR10';
    end if;
  end loop;
  if p_projection ? 'intent_id' and p_projection->>'intent_id' is not null
     and p_projection->>'intent_id' !~ v_uuid_re then
    raise exception 'projection intent_id is not a valid uuid' using errcode='CLR10';
  end if;
  if p_projection ? 'registration_id' and p_projection->>'registration_id' is not null
     and p_projection->>'registration_id' !~ v_uuid_re then
    raise exception 'projection registration_id is not a valid uuid' using errcode='CLR10';
  end if;
  if p_projection ? 'applicant' and p_projection->>'applicant' is not null
     and p_projection->>'applicant' !~ v_uuid_re then
    raise exception 'projection applicant is not a valid uuid' using errcode='CLR10';
  end if;

  insert into clara.stripe_events(
    event_id,type,livemode,session_id,intent_id,registration_id,applicant,amount_total,currency,
    payment_status,mode,session_status,customer_id,subscription_id,projection
  ) values (
    p_event_id,
    p_type,
    (p_projection->>'livemode')::boolean,
    p_projection->>'session_id',
    (p_projection->>'intent_id')::uuid,
    (p_projection->>'registration_id')::uuid,
    (p_projection->>'applicant')::uuid,
    (p_projection->>'amount_total')::bigint,
    p_projection->>'currency',
    p_projection->>'payment_status',
    p_projection->>'mode',
    p_projection->>'session_status',
    p_projection->>'customer_id',
    p_projection->>'subscription_id',
    p_projection
  )
  on conflict (event_id) do nothing;
  v_recorded := found;

  return jsonb_build_object('event_id',p_event_id,'recorded',v_recorded);
end $$;

create function clara.apply_stripe_events(p_limit integer default 100) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record;
  i record;
  v_examined integer := 0;
  v_applied integer := 0;
  v_problems integer := 0;
  v_constraint text;
  v_sql text;
begin
  if p_limit is null or p_limit<1 then
    raise exception 'limit must be positive' using errcode='CLR10';
  end if;

  -- C-5 starvation fix: every skippable row is excluded inside the query, BEFORE LIMIT. Keeping
  -- the consumed-payment check in the loop lets old rows occupy the whole window forever. The
  -- two dynamic shapes preserve C-2's executable negative paths before C-3 creates its table.
  if to_regclass('clara.firm_registration_payments') is not null then
    v_sql := $q$
      select se.* from clara.stripe_events se
       where se.type='checkout.session.completed'
         and not exists (
           select 1 from clara.stripe_event_problems sep
            where sep.event_id=se.event_id and sep.resolved_at is null
         )
         and not exists (
           select 1 from clara.firm_registration_payments frp
            where frp.stripe_event_id=se.event_id
         )
       order by se.received_at,se.event_id
       limit $1
    $q$;
  else
    v_sql := $q$
      select se.* from clara.stripe_events se
       where se.type='checkout.session.completed'
         and not exists (
           select 1 from clara.stripe_event_problems sep
            where sep.event_id=se.event_id and sep.resolved_at is null
         )
       order by se.received_at,se.event_id
       limit $1
    $q$;
  end if;

  for e in execute v_sql using p_limit loop

    v_examined := v_examined+1;

    -- 裁-58/裁-28 tripwire: this second disjunct is an RM0-only relaxation. When amounts are
    -- ruled it MUST tighten to proof of settled payment; it is deliberately not a paid-price rule.
    if (
      e.payment_status='paid'
      or (e.mode='subscription' and e.session_status='complete')
    ) is not true then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'payment_not_settled',jsonb_build_object(
        'payment_status',e.payment_status,'mode',e.mode,'session_status',e.session_status))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    if e.registration_id is null or e.applicant is null or e.intent_id is null
       or e.session_id is null then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'metadata_missing',jsonb_build_object(
        'registration_id_present',e.registration_id is not null,
        'applicant_present',e.applicant is not null,
        'intent_id_present',e.intent_id is not null,
        'session_id_present',e.session_id is not null))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    select ci.id,ci.registration_id,ci.applicant,ci.session_id into i
      from clara.checkout_intents ci
     where ci.id=e.intent_id;
    if not found then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'intent_not_found',jsonb_build_object('intent_id',e.intent_id))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    if i.session_id is distinct from e.session_id
       or i.registration_id is distinct from e.registration_id
       or i.applicant is distinct from e.applicant then
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'intent_mismatch',jsonb_build_object(
        'intent_id',e.intent_id,
        'session_id_matches',i.session_id is not distinct from e.session_id,
        'registration_id_matches',i.registration_id is not distinct from e.registration_id,
        'applicant_matches',i.applicant is not distinct from e.applicant))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
      continue;
    end if;

    -- BLOCKER-4: this BEGIN/EXCEPTION block is a per-row subtransaction. Do not widen the
    -- stripe_event_id conflict target: uq_frp_registration must surface as duplicate_payment.
    begin
      insert into clara.firm_registration_payments(
        registration_id,applicant,stripe_event_id,stripe_session_id,
        stripe_customer_id,stripe_subscription_id
      ) values (
        e.registration_id,e.applicant,e.event_id,e.session_id,e.customer_id,e.subscription_id
      )
      on conflict (stripe_event_id) do nothing;
      if found then
        v_applied := v_applied+1;
      end if;
    exception when unique_violation then
      get stacked diagnostics v_constraint=constraint_name;
      if v_constraint is distinct from 'uq_frp_registration' then
        raise;
      end if;
      insert into clara.stripe_event_problems(event_id,problem,detail)
      values (e.event_id,'duplicate_payment',jsonb_build_object(
        'registration_id',e.registration_id,'constraint',v_constraint))
      on conflict (event_id,problem) where resolved_at is null do nothing;
      if found then v_problems := v_problems+1; end if;
    end;
  end loop;

  return jsonb_build_object('examined',v_examined,'applied',v_applied,'problems',v_problems);
end $$;

-- ==============================================================================================
-- 5. OPERATOR PROBLEM SURFACE. _human_ctx supplies the owner floor; the following fragment is
-- byte-copied from approve_firm_registration so the operator-firm predicate cannot drift.
-- ==============================================================================================
create function clara.list_stripe_event_problems(
  p_include_resolved boolean default false
) returns setof clara.stripe_event_problems
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  return query
  select sep.* from clara.stripe_event_problems sep
   where coalesce(p_include_resolved,false) or sep.resolved_at is null
   order by sep.noticed_at,sep.id;
end $$;

create function clara.resolve_stripe_event_problem(
  p_problem uuid,
  p_resolution text,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;
  v_dedupe jsonb;
  v_problem clara.stripe_event_problems%rowtype;
  v_resolution text;
  v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_problem is null then
    raise exception 'problem is required' using errcode='CLR10';
  end if;
  v_resolution := nullif(btrim(p_resolution),'');
  if v_resolution is null then
    raise exception 'resolution is required' using errcode='CLR10';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  v_dedupe := clara._reserve_op(c.firm,'resolve_stripe_event_problem',p_op_key,
    clara._hash(jsonb_build_object(
      'problem',p_problem,'resolution',v_resolution,'actor',c.actor)));
  if v_dedupe is not null then
    return v_dedupe;
  end if;

  select * into v_problem from clara.stripe_event_problems
   where id=p_problem for update;
  if not found then
    raise exception 'stripe event problem not found' using errcode='CLR11';
  end if;
  if v_problem.resolved_at is not null then
    raise exception 'stripe event problem is already resolved' using errcode='CLR09';
  end if;

  update clara.stripe_event_problems
     set resolved_at=now(), resolved_by=c.actor, resolution=v_resolution
   where id=p_problem;

  v_result := jsonb_build_object(
    'problem_id',p_problem,'event_id',v_problem.event_id,'resolved',true);
  return clara._finish_op(c.firm,'resolve_stripe_event_problem',p_op_key,v_result);
end $$;

revoke all on function clara.record_stripe_event(text,text,jsonb) from public;
revoke all on function clara.apply_stripe_events(integer) from public;
revoke all on function clara.list_stripe_event_problems(boolean) from public;
revoke all on function clara.resolve_stripe_event_problem(uuid,text,text) from public;

grant execute on function clara.record_stripe_event(text,text,jsonb) to clara_stripe_webhook;
grant execute on function clara.apply_stripe_events(integer) to clara_stripe_webhook;
grant execute on function clara.list_stripe_event_problems(boolean) to clara_authenticated;
grant execute on function clara.resolve_stripe_event_problem(uuid,text,text) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 6. FAIL-CLOSED TAIL: exact cohort, table walls, door posture, role closure, and C-1 immobility.
-- ==============================================================================================
do $tail$
declare
  v_names text;
  v_n integer;
  v_table text;
  v_pre jsonb;
  v_post jsonb;
  v_role text;
  v_sig regprocedure;
  v_acl text[];
  v_effective text[];
begin
  select string_agg(c.relname,',' order by c.relname) into v_names
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara'
     and c.relname in ('stripe_events','stripe_event_problems','stripe_object_map')
     and c.relkind='r';
  if v_names is distinct from 'stripe_event_problems,stripe_events,stripe_object_map' then
    raise exception 'checkout C-2 tail: table cohort is not exact: %',coalesce(v_names,'(none)')
      using errcode='CLR10';
  end if;

  foreach v_table in array array['stripe_events','stripe_event_problems','stripe_object_map'] loop
    select count(*) into v_n
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=v_table and c.relrowsecurity
       and c.relforcerowsecurity and pg_get_userbyid(c.relowner)='clara_fn_owner';
    if v_n<>1 then
      raise exception 'checkout C-2 tail: %. forced-RLS/owner posture is wrong',v_table
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
      raise exception 'checkout C-2 tail: %. owner-only policy is not exact',v_table
        using errcode='CLR10';
    end if;
  end loop;

  select count(*) into v_n
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   where n.nspname='clara'
     and c.relname in ('stripe_events','stripe_event_problems','stripe_object_map')
     and a.grantee<>c.relowner;
  if v_n<>0 then
    raise exception 'checkout C-2 tail: % non-owner direct table grant(s) exist',v_n
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.stripe_events'::regclass
     and conname in ('ck_stripe_events_event_id_shape','ck_stripe_events_status_shape',
                     'ck_stripe_events_no_pii')
     and contype='c' and convalidated;
  if v_n<>3 then
    raise exception 'checkout C-2 tail: Stripe event mistake-net CHECK cohort is not exact'
      using errcode='CLR10';
  end if;

  select count(*) into v_n
    from pg_index i
    join pg_attribute a1 on a1.attrelid=i.indrelid and a1.attnum=i.indkey[0]
    join pg_attribute a2 on a2.attrelid=i.indrelid and a2.attnum=i.indkey[1]
   where i.indexrelid='clara.uq_stripe_event_problems_event_open'::regclass
     and i.indrelid='clara.stripe_event_problems'::regclass
     and i.indisunique and i.indnkeyatts=2
     and a1.attname='event_id' and a2.attname='problem'
     and pg_get_expr(i.indpred,i.indrelid)='(resolved_at IS NULL)';
  if v_n<>1 then
    raise exception 'checkout C-2 tail: open-problem partial unique index was not positively read'
      using errcode='CLR10';
  end if;

  select count(*) into v_n from pg_constraint
   where conrelid='clara.stripe_object_map'::regclass
     and contype in ('p','u') and convalidated;
  if v_n<>2 then
    raise exception 'checkout C-2 tail: stripe_object_map PK/UNIQUE pair is not exact'
      using errcode='CLR10';
  end if;

  foreach v_sig in array array[
    'clara.record_stripe_event(text,text,jsonb)'::regprocedure,
    'clara.apply_stripe_events(integer)'::regprocedure,
    'clara.list_stripe_event_problems(boolean)'::regprocedure,
    'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure
  ] loop
    select count(*) into v_n
      from pg_proc p
     where p.oid=v_sig and p.prosecdef and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and p.prolang=(select oid from pg_language where lanname='plpgsql')
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n<>1 then
      raise exception 'checkout C-2 tail: door % has the wrong owner/definer/language/search_path',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  foreach v_role in array array['clara_stripe_webhook','clara_stripe_webhook_login'] loop
    select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_effective
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara'
       and has_function_privilege(v_role,p.oid,'EXECUTE');
    if v_effective is distinct from array[
      'clara.apply_stripe_events(integer)',
      'clara.record_stripe_event(text,text,jsonb)'
    ] then
      raise exception 'checkout C-2 tail W-O: webhook effective routine set for % is %, expected exactly two',v_role,v_effective
        using errcode='CLR10';
    end if;
  end loop;

  foreach v_sig in array array[
    'clara.record_stripe_event(text,text,jsonb)'::regprocedure,
    'clara.apply_stripe_events(integer)'::regprocedure
  ] loop
    select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) into v_acl
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig and a.privilege_type='EXECUTE';
    if v_acl is distinct from array['clara_fn_owner','clara_stripe_webhook'] then
      raise exception 'checkout C-2 tail: webhook door % ACL is %',v_sig,v_acl
        using errcode='CLR10';
    end if;
  end loop;

  foreach v_sig in array array[
    'clara.list_stripe_event_problems(boolean)'::regprocedure,
    'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure
  ] loop
    select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) into v_acl
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig and a.privilege_type='EXECUTE';
    if v_acl is distinct from array['clara_authenticated','clara_fn_owner'] then
      raise exception 'checkout C-2 tail: operator door % ACL is %',v_sig,v_acl
        using errcode='CLR10';
    end if;
  end loop;

  foreach v_role in array array['clara_stripe_webhook','clara_stripe_webhook_login'] loop
    if not has_schema_privilege(v_role,'clara','USAGE') then
      raise exception 'checkout C-2 tail: webhook role % cannot reach schema clara',v_role
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
      raise exception 'checkout C-2 tail W-O: webhook role % has an effective clara relation privilege',v_role
        using errcode='CLR10';
    end if;
  end loop;

  if not exists (
    select 1 from pg_roles r join pg_auth_members m on m.member=r.oid
    join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_stripe_webhook_login' and g.rolname='clara_stripe_webhook'
  ) or not exists (
    select 1 from pg_roles r join pg_auth_members m on m.member=r.oid
    join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_stripe_webhook_login'
  ) then
    raise exception 'checkout C-2 tail: webhook role membership chain is incomplete'
      using errcode='CLR10';
  end if;

  select count(*) into v_n
    from pg_roles
   where rolname in ('clara_stripe_webhook','clara_stripe_webhook_login')
     and not rolcreaterole and not rolcreatedb and not rolreplication
     and not rolsuper and not rolbypassrls;
  if v_n<>2 then
    raise exception 'checkout C-2 tail: webhook roles retain a cluster-creation/superuser/BYPASSRLS capability'
      using errcode='CLR10';
  end if;

  if exists (
    with recursive closure(oid,path) as (
      select oid,array[oid] from pg_roles
       where rolname in ('clara_stripe_webhook','clara_stripe_webhook_login')
      union all
      select m.roleid,c.path||m.roleid from closure c
      join pg_auth_members m on m.member=c.oid
      where not m.roleid=any(c.path)
    )
    select 1 from closure c join pg_roles r on r.oid=c.oid
     where r.rolbypassrls or r.rolsuper or r.rolcreaterole or r.rolcreatedb
        or r.rolreplication
  ) or exists (
    select 1 from pg_roles
     where rolname in ('clara_stripe_webhook','clara_stripe_webhook_login')
       and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb
            or rolreplication)
  ) then
    raise exception 'checkout C-2 tail W-O: webhook role closure reaches cluster creation/superuser/BYPASSRLS/login'
      using errcode='CLR10';
  end if;

  select to_jsonb(string_agg(attname,',' order by attnum)) into v_post
    from pg_attribute where attrelid='clara.checkout_intents'::regclass
      and attnum>0 and not attisdropped;
  select v into v_pre from _fs4c2_prestate where k='checkout_intents_columns';
  if v_post is distinct from v_pre then
    raise exception 'checkout C-2 tail: checkout_intents columns moved (pre %, post %)',v_pre,v_post
      using errcode='CLR10';
  end if;
  if to_regclass('clara.firm_registration_payments') is not null
     or to_regprocedure('clara.claim_paid_firm(uuid,text)') is not null then
    raise exception 'checkout C-2 tail: C-3 scope leaked into C-2'
      using errcode='CLR10';
  end if;

  raise notice 'checkout C-2 tail: OK -- three exact owner-only forced-RLS tables; bounded redacted append-only Stripe projection; one open problem per event/reason and one-shot resolution; object-map PK/UNIQUE; webhook role has schema reachability, exactly two routine EXECUTEs, zero relation privileges and no cluster-creation/superuser/BYPASSRLS closure; operator doors are owner+walled. C-3 payment-dependent cells remain named and deferred.';
end $tail$;
