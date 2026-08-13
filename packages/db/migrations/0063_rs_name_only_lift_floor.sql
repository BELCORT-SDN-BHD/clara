-- 0063_rs_name_only_lift_floor.sql -- THE OWNER-ONLY LIFT FLOOR (finding B5).
-- MIGRATION NUMBER claimed at MERGE. **THIS FILE MUST BE NUMBERED IMMEDIATELY AFTER
-- 0062_rs_name_only_guard.sql** -- it is the second half of one ruling and its prestate
-- refuses to apply without the first half in place.
--
-- WHY IT IS A SEPARATE FILE, STATED PLAINLY. It is not a design preference: the repo's authoring
-- harness enforces a 500-line ceiling on files an agent writes, the guard file is already at that
-- ceiling, and the alternative was deleting rationale from a security migration -- which the house
-- rule explicitly forbids ("a migration whose tail only says OK has proven nothing"). The Wave E
-- delta lane hit the same wall in this same PR and answered it the same way, splitting one logical
-- migration across 0058_wave_e_delta_metrics.sql + its _behavior/_security siblings. The split is also
-- defensible on its merits: this trigger guards a DIFFERENT table (clara.client_facts, not
-- clara.counterparties) and enforces a DIFFERENT rule (who may lower the wall, not what the wall
-- refuses), so it reviews cleanly on its own.
--
-- THE ORDERING OBLIGATION, AND ITS HONEST WINDOW. Each migration is its own transaction, so
-- between the guard file committing and this file committing there is an interval in which the
-- policy exists and an ADMIN could still lift it. That interval is milliseconds inside a single
-- `migrate` run on a target where the only actor is the ceremony operator, so it is not a real
-- exposure -- but it is a real property of the split and is written down rather than glossed. If
-- this file fails to apply, the operator MUST treat the pair as incomplete: the enrichment wall
-- stands (strictly better than before) but the lift floor does not.
--
-- WHAT IT ENFORCES. clara.record_client_fact supersedes a live fact by stamping the predecessor
-- and INSERTing a successor. A supersession that moves a client's customer_identity_policy AWAY
-- from a live 'name_only' is a LIFT of AGENTS.md hard constraint 12, and codex graded the door's
-- admin+ floor a BLOCKER for it: the same rank that ARMS the policy could silently un-arm it.
-- Owner ruling: keep the lift (a wall that cannot be lowered gets routed around by
-- retire-and-recreate, which is worse), but raise ONLY the lift to an OWNER floor.
--   * absent -> 'name_only'        (ARMING)    -- admin+, unchanged.
--   * 'unrestricted' -> 'name_only' (RE-ARMING) -- admin+, unchanged.
--   * 'name_only' -> anything else  (LIFTING)   -- OWNER of that firm, enforced here.
--   * every other fact_key (entity_type, msic, ...) -- untouched, tested.
--
-- ADDITIVE, SO NO D1. This creates a NEW trigger; it does not replace clara.record_client_fact's
-- body or any other function body. PostgreSQL's D1 write-quiesce obligation attaches to replacing
-- the body of a function that may be mid-call (packages/db/README.md, "Deploy contract"), and
-- nothing here does that. A trigger created inside this transaction is seen by every statement
-- after it commits, including calls already in flight against the unchanged door body.
--
-- IDENTITY IS THE ACTOR COLUMN, PROVEN FROM 0055's DDL, NOT GUESSED (standing law 27.3, and the
-- 0055 S4 lesson that "file text is not the live schema" -- so the prestate re-proves it from the
-- live catalog too). 0055:399 declares `recorded_by uuid not null references clara.users(id)`,
-- and 0055's door stamps it with `c.actor`, i.e. clara.jwt_sub() as resolved by clara._human_ctx.
-- That column IS the acting principal for a fact row; the firm is NEW.firm_id, which 0055 binds
-- to the client by the composite FK fk_client_facts_client, so the (actor, firm) pair this
-- trigger checks is the same tenant the row belongs to and not a second, looser reading.
--
-- WHAT THIS IS NOT. It is a mistake-net at the product layer, exactly like its companion. Writing
-- clara.client_facts directly requires table-level DML, which no application role holds (0055
-- grants clara_authenticated SELECT only); the door and a superuser are the writers. A superuser
-- forging recorded_by is out of scope by construction, the same posture AGENTS.md constraint 11
-- takes for the pinned ids.
--
-- CELLS: packages/db/tests/name-only-guard.test.mjs (NOG-14..17), gated by
-- rs-guard-preintegration-gate.mjs. CONTRACT-BLIND: the cells probe the live catalog, never this
-- .sql, and build their own owner/admin actors.
set local statement_timeout = '2min';  -- PRECAUTIONARY, not load-bearing: one function, one
-- trigger, and single-row catalog reads. Nothing here scans a table.

-- =====================================================================================
-- S0 -- PRESTATE. The first half must be in place, and every column this trigger reads must
-- exist under the name it reads. A false premise aborts here.
-- =====================================================================================
do $s0$
declare v_n int;
begin
  -- (0.1) THE FIRST HALF IS PRESENT. This file is meaningless alone: without the policy key there
  -- is no policy to lift, and without the counterparty wall a lift protects nothing.
  select count(*) into v_n from clara.client_fact_keys where fact_key = 'customer_identity_policy';
  if v_n <> 1 then
    raise exception 'lift floor prestate: fact key customer_identity_policy is absent -- 0062_rs_name_only_guard.sql must be numbered and applied BEFORE this file'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_trigger
   where tgrelid = 'clara.counterparties'::regclass and not tgisinternal
     and tgname = 't_counterparties_name_only_guard';
  if v_n <> 1 then
    raise exception 'lift floor prestate: the counterparty enrichment wall is not installed -- this file is the second half of that ruling and must not land alone'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE ACTOR COLUMN, RE-PROVEN FROM THE LIVE CATALOG. 0055:399 declares recorded_by, but
  -- the header cites a FILE and a file is not the schema. If it were ever renamed, the trigger
  -- below would read NULL and the floor would silently admit everyone -- fail OPEN, the worst
  -- outcome for a security floor. Proven by name, alongside the other three columns it reads.
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.client_facts'::regclass and not a.attisdropped
     and a.attname in ('recorded_by', 'firm_id', 'fact_key', 'fact_value');
  if v_n <> 4 then
    raise exception 'lift floor prestate: clara.client_facts carries % of the 4 columns this floor reads (recorded_by, firm_id, fact_key, fact_value) -- refusing to install a floor that would fail open', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE SUPERSESSION LINK THIS TRIGGER DETECTS BY. 0055's door stamps the predecessor with
  -- the successor's id BEFORE inserting the successor -- which is only legal because the FK is
  -- DEFERRABLE. That deferral is what makes `superseded_by = new.id` readable from a BEFORE
  -- INSERT trigger, and it is therefore load-bearing for this file, not incidental.
  select count(*) into v_n from pg_constraint con
   where con.conrelid = 'clara.client_facts'::regclass and con.contype = 'f'
     and con.condeferrable and con.condeferred
     and pg_get_constraintdef(con.oid) like '%superseded_by%';
  if v_n <> 1 then
    raise exception 'lift floor prestate: client_facts.superseded_by is not a DEFERRABLE INITIALLY DEFERRED FK -- the predecessor could not be stamped before the successor is inserted, and this trigger''s detection would never fire'
      using errcode = 'CLR10';
  end if;

  -- (0.4) The role vocabulary this floor names. role_rank must know 'owner', or the comparison
  -- below silently degrades to NULL and refuses (or admits) for the wrong reason.
  if clara.role_rank('owner') is null then
    raise exception 'lift floor prestate: clara.role_rank(''owner'') is NULL -- the role vocabulary this floor is written against is gone'
      using errcode = 'CLR10';
  end if;

  -- (0.5) The name is free.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'clara.client_facts'::regclass and not tgisinternal
     and tgname = 't_client_facts_name_only_lift_floor';
  if v_n <> 0 then
    raise exception 'lift floor prestate: t_client_facts_name_only_lift_floor already exists'
      using errcode = 'CLR10';
  end if;

  raise notice 'lift floor S0 prestate OK: the guard half is applied (key + counterparty trigger), client_facts carries all 4 read columns, superseded_by is DEFERRABLE INITIALLY DEFERRED, role_rank knows owner, and the trigger name is free.';
end $s0$;

-- =====================================================================================
-- S1 -- THE FLOOR. Owned by clara_fn_owner: it reads clara.firm_memberships, whose forced RLS
-- admits the owner policy (0002:492), so a SECURITY DEFINER owned by that role sees the roster
-- instead of seeing nothing and failing OPEN.
-- =====================================================================================
set role clara_fn_owner;

create function clara._tf_client_facts_name_only_lift_floor() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $floor$
declare v_prior jsonb;
begin
  -- (1) OTHER FACT KEYS ARE NOT THIS TRIGGER'S BUSINESS. entity_type and msic flow through the
  -- same door and the same table; this floor must be invisible to them.
  if new.fact_key is distinct from 'customer_identity_policy' then return new; end if;

  -- (2) IS THIS A SUPERSESSION AT ALL, AND OF WHAT? The predecessor is found by the link the door
  -- has ALREADY written when this BEFORE INSERT fires (see prestate 0.3): it stamped
  -- superseded_by = <this row's id> before inserting this row. No predecessor means this is an
  -- ARMING -- the first policy this client has ever carried -- which stays admin+ and returns.
  select cf.fact_value into v_prior
    from clara.client_facts cf where cf.superseded_by = new.id;
  if v_prior is null then return new; end if;

  -- (3) ONLY A MOVE AWAY FROM A LIVE 'name_only' IS A LIFT. Re-arming (unrestricted -> name_only)
  -- and re-recording the same value are not lifts and stay admin+.
  if v_prior is distinct from '"name_only"'::jsonb then return new; end if;
  if new.fact_value = '"name_only"'::jsonb then return new; end if;

  -- (4) THE OWNER FLOOR. The principal is the row's OWN recorded_by -- the column 0055's door
  -- stamps with clara._human_ctx's actor -- checked against the roster of the row's OWN firm_id.
  -- Expressed as a RANK FLOOR rather than `role = 'owner'` because that is the house's idiom for
  -- every other floor in the schema (_human_ctx(role_rank(...))); with 'owner' the top rank today
  -- the two are identical, and the rank form stays correct if a higher rank is ever minted.
  if not exists (
    select 1 from clara.firm_memberships fm
     where fm.user_id = new.recorded_by
       and fm.firm_id = new.firm_id
       and fm.status = 'active'
       and coalesce(clara.role_rank(fm.role), -1) >= clara.role_rank('owner')
  ) then
    raise exception 'lifting a client''s NAME-ONLY customer policy is an OWNER act: this fact would move customer_identity_policy away from ''name_only'', and the recorded actor is not an active owner of this firm. Arming and re-arming stay admin+. (refusal: customer_identity_lift_requires_owner)'
      using errcode = 'CLR04',
            detail = jsonb_build_object(
              'reason', 'customer_identity_lift_requires_owner',
              'client', new.client_id, 'actor', new.recorded_by,
              'from', v_prior, 'to', new.fact_value)::text;
  end if;
  return new;
end $floor$;
revoke all on function clara._tf_client_facts_name_only_lift_floor() from public;

comment on function clara._tf_client_facts_name_only_lift_floor() is
  'Finding B5, owner-adjudicated. AGENTS.md hard constraint 12 may be LOWERED only by an owner: a '
  'client_facts row superseding a live customer_identity_policy of ''name_only'' toward any other '
  'value is refused CLR04 unless recorded_by is an active owner of firm_id. Arming and re-arming '
  'stay admin+; every other fact_key is untouched. Token: customer_identity_lift_requires_owner.';

create trigger t_client_facts_name_only_lift_floor
  before insert on clara.client_facts
  for each row execute function clara._tf_client_facts_name_only_lift_floor();

reset role;

-- =====================================================================================
-- S2 -- TAIL CENSUS, with a BEHAVIOURAL self-proof. Catalog reads prove the object exists;
-- only an attempted lift proves it refuses.
-- =====================================================================================
do $s2$
declare
  v_n int; v_probe text := 'not-run'; v_detail text;
  v_client uuid; v_firm uuid; v_admin uuid; v_prior uuid; v_new uuid;
begin
  -- (2.1) The trigger is an ENABLED BEFORE INSERT FOR EACH ROW trigger on the right table.
  -- tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT.
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = 'clara.client_facts'::regclass and not t.tgisinternal
     and t.tgname = 't_client_facts_name_only_lift_floor'
     and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
     and t.tgenabled = 'O';
  if v_n <> 1 then
    raise exception 'lift floor S2.1: the trigger is not an ENABLED BEFORE INSERT FOR EACH ROW trigger on clara.client_facts (% match)', v_n
      using errcode = 'CLR10';
  end if;

  -- (2.2) It does NOT fire on UPDATE. That matters: 0055's supersession STAMP is an UPDATE, and a
  -- floor that fired there would refuse the predecessor's own stamp and deadlock every lift into
  -- an unconditional failure -- including an owner's lawful one.
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = 'clara.client_facts'::regclass and not t.tgisinternal
     and t.tgname = 't_client_facts_name_only_lift_floor' and (t.tgtype & 16) = 16;
  if v_n <> 0 then
    raise exception 'lift floor S2.2: the floor also fires on UPDATE, which would refuse 0055''s supersession stamp and break every lawful lift'
      using errcode = 'CLR10';
  end if;

  -- (2.3) SECURITY DEFINER, pinned search_path, owned by clara_fn_owner -- the three properties
  -- that let it read firm_memberships under forced RLS instead of failing open.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname = '_tf_client_facts_name_only_lift_floor'
     and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole
     and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                  where cfg like 'search_path=%clara%');
  if v_n <> 1 then
    raise exception 'lift floor S2.3: the floor function is not a clara_fn_owner-owned SECURITY DEFINER with a pinned search_path -- it would read an empty roster and admit every lift'
      using errcode = 'CLR10';
  end if;

  -- (2.4) 0055's own triggers are UNDISTURBED. This file is additive; if the supersede-only or
  -- append-only walls vanished, something here replaced rather than added.
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = 'clara.client_facts'::regclass and not t.tgisinternal
     and t.tgname in ('t_client_facts_supersede_only', 't_client_facts_no_delete',
                      't_client_facts_no_truncate');
  if v_n <> 3 then
    raise exception 'lift floor S2.4: only % of 0055''s 3 client_facts triggers survive -- this file must ADD, never replace', v_n
      using errcode = 'CLR10';
  end if;

  -- (2.5) BEHAVIOURAL SELF-PROOF. Everything above reads the catalog; none of it proves a refusal.
  -- Against a real armed client on THIS database, forge the exact shape of an ADMIN lift -- the
  -- predecessor stamp plus a successor whose recorded_by is a non-owner -- inside an exception
  -- block whose implicit savepoint discards it. "Not refused" and "refused by something else" are
  -- BOTH hard aborts: absence of this floor's own token is not evidence the floor fired.
  select cf.client_id, cf.firm_id, cf.id into v_client, v_firm, v_prior
    from clara.client_facts cf
   where cf.fact_key = 'customer_identity_policy' and cf.superseded_at is null
     and cf.fact_value = '"name_only"'::jsonb
   order by cf.client_id limit 1;
  if v_client is null then
    raise notice 'lift floor S2.5: no client on this database carries a live name_only policy, so the behavioural self-proof is NOT AVAILABLE here -- expected on a throwaway/CI database, where packages/db/tests/name-only-guard.test.mjs (NOG-14..17) proves the refusal against its own fixtures. Stated, not skipped silently.';
  else
    -- A deliberately NON-owner actor of that firm; if the firm has only owners there is nothing
    -- to prove with and the probe says so rather than inventing a user.
    select fm.user_id into v_admin from clara.firm_memberships fm
     where fm.firm_id = v_firm and fm.status = 'active'
       and coalesce(clara.role_rank(fm.role), -1) < clara.role_rank('owner')
     order by fm.user_id limit 1;
    if v_admin is null then
      raise notice 'lift floor S2.5: the armed client''s firm has no active NON-owner member, so an admin lift cannot be staged here -- the rig cells cover it. Stated, not skipped silently.';
    else
      v_new := gen_random_uuid();
      perform set_config('role', 'clara_fn_owner', true);
      begin
        update clara.client_facts set superseded_by = v_new, superseded_at = now()
          where id = v_prior;
        insert into clara.client_facts(id, firm_id, client_id, fact_key, fact_value, basis,
            basis_kind, validated_against, recorded_by)
          values (v_new, v_firm, v_client, 'customer_identity_policy', '"unrestricted"'::jsonb,
            'lift floor S2.5 in-transaction self-proof; rolled back', 'owner_instruction',
            'enum:CUSTOMER_IDENTITY_POLICY_V1', v_admin);
        v_probe := 'NOT REFUSED';
      exception when others then
        get stacked diagnostics v_detail = pg_exception_detail;
        v_probe := sqlstate || ' | ' || sqlerrm || ' | detail=' || coalesce(nullif(v_detail, ''), '<none>');
      end;
      perform set_config('role', 'none', true);
      if v_probe = 'NOT REFUSED' then
        raise exception 'lift floor S2.5: a NON-owner lift of client % was NOT refused -- refusing to leave behind a floor that does not floor', v_client
          using errcode = 'CLR10';
      end if;
      if position('customer_identity_lift_requires_owner' in v_probe) = 0 then
        raise exception 'lift floor S2.5: the probe was refused, but NOT by this floor (%) -- something else stopped it and that is not evidence the floor works', v_probe
          using errcode = 'CLR10';
      end if;
      raise notice 'lift floor S2.5 BEHAVIOURAL SELF-PROOF: a non-owner lift of client % was REFUSED by this floor, in this transaction, and rolled back -- %', v_client, v_probe;
    end if;
  end if;

  raise notice 'lift floor OK: clara._tf_client_facts_name_only_lift_floor + t_client_facts_name_only_lift_floor (BEFORE INSERT only, never UPDATE) -- lowering AGENTS.md hard constraint 12 is now an OWNER act. Arming and re-arming stay admin+; entity_type, msic and every other fact key are untouched.';
end $s2$;
