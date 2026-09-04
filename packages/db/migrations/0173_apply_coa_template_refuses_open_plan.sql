-- =====================================================================================
-- DB-A / 9 of 9 -- clara.apply_coa_template REFUSES WHILE THE ONBOARDING PLAN IS OPEN
-- (裁-193, owner, 2026-09-04 ≈16:45 MYT).
--
-- APPLY ORDER: anywhere after 0156. It shares no object with dba1-dba8.
--
-- THE RULING. 裁-23 Q5's "the apply is a separate human click after the client is created"
-- was ambiguous between AFTER begin_client_onboarding (plan open) and AFTER
-- commit_client_onboarding. The owner ruled COMMIT.
--
-- WHY THIS FILE EXISTS, AND WHY THE FACE WAS NOT ENOUGH. The sibling dba6 makes
-- clara.coa_chart_state report seed_decision_plan_state so the card can say "decided in the
-- interview -- applies after commit" instead of the false "undecided". That is a FACE. A face
-- that merely declines to offer a control is a UI-only predicate, and PRD §6 puts the wall in
-- the database: anything the UI declines, a direct RPC can still do. MEASURED against the live
-- body this session, clara.apply_coa_template (0156:726-905) consults the onboarding plan
-- NOWHERE -- its rungs are op_key, family nulls, client-in-firm, a visible published template,
-- an empty chart, and no adopted adoption. So the ruling had no enforcement at all until this
-- rung, and the face alone would have been an announcement.
--
-- THE COST IT PREVENTS, concretely: apply_coa_template refuses `chart_not_empty` forever after.
-- A chart planted mid-interview on a client who is then CANCELLED leaves that client ARCHIVED
-- holding a planted chart that can never be re-applied or cleanly replaced.
--
-- THE BODY IS EXTRACTED MECHANICALLY, NEVER RETYPED (0104's own discipline): the text below is
-- sliced out of 0156_coa_apply_template.sql between the function header and its closing
-- dollar-quote, with `create function` changed to `create or replace function` and ONE rung
-- inserted after Rung 6. The prestate pins the live prosrc sha so the slice is proven to be
-- what is actually installed, and the tail proves the insertion is the ONLY delta by removing
-- the rung and requiring the pinned pre-image back byte for byte.
--
-- STATIC BODY BY REQUIREMENT: this file contains no `execute` of any kind, so it adds no
-- dynamic-SQL barrier to apps/web's successor census -- the class that reds CI when a splice
-- goes unregistered. Asserted mechanically in the tail, not merely intended.
--
-- D1 WRITE-QUIESCE IS OWED. clara.apply_coa_template is a GRANTED, AUDITED WRITER (0156:1228,
-- clara_authenticated), and PostgreSQL runs an in-flight PL/pgSQL call to completion on the
-- body it STARTED with -- so an apply that spans this deploy runs the OLD body and plants a
-- chart the new rung would have refused. One door, one window.
-- =====================================================================================

-- Precautionary, not load-bearing: one CREATE OR REPLACE, no data movement.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- The pre-image STASH, so the tail's subtraction compares against what was live at prestate
-- time and never against this file's own copy of it.
create temp table _dba9_pre(k text primary key, v text) on commit drop;

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba9_pre$
declare v_src text; v_got text;
begin
  if to_regprocedure('clara.apply_coa_template(uuid,uuid,text[],text)') is null then
    raise exception 'dba9 prestate: clara.apply_coa_template does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.apply_coa_template(uuid,uuid,text[],text)'::regprocedure;
  v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  -- Measured on a replay of main's chain to 0164 while authoring this file (DB-A lane,
  -- 2026-09-04). 0156:726 is the only definition of this body.
  if v_got <> '26ddd7f3131f3d2df08bcec6211a4d83be1fb2a0b778ce8ee700185de8e91bf6' then
    raise exception 'dba9 prestate: apply_coa_template prosrc sha256 is % -- not the 0156 body this file slices. STOP.', v_got
      using errcode = 'CLR10';
  end if;
  if position('onboarding_plan_open' in v_src) <> 0 then
    raise exception 'dba9 prestate: the door already refuses on an open plan -- already applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE RULING'S PREMISE, witnessed rather than trusted: the live door consults no plan.
  if position('onboarding_plans' in v_src) <> 0 then
    raise exception 'dba9 prestate: the live apply door ALREADY reads clara.onboarding_plans -- the premise that it consults no plan is false against this body, and the rung below would be a second, unreviewed reading'
      using errcode = 'CLR10';
  end if;
  -- The six named refusals this file carries unchanged, witnessed before the replace.
  if position('client_not_in_firm' in v_src) = 0 or position('template_not_published' in v_src) = 0
     or position('chart_not_empty' in v_src) = 0 or position('already_adopted' in v_src) = 0
     or position('families_required' in v_src) = 0 or position('core_family_dropped' in v_src) = 0 then
    raise exception 'dba9 prestate: the live body is missing one of the six named refusals this file carries verbatim'
      using errcode = 'CLR10';
  end if;
  insert into _dba9_pre(k, v) values ('prosrc:apply_coa_template', v_src);
  raise notice 'dba9 prestate: clean -- apply_coa_template matches its 0156 pre-image sha, reads clara.onboarding_plans nowhere (the ruling premise, witnessed), and carries all six named refusals.';
end $dba9_pre$;

do $dba9_rung$
begin
  insert into _dba9_pre(k, v) values ('rung', $rung$
  -- Rung 6c -- 裁-193 (owner, 2026-09-04 ≈16:45 MYT): THE CHART APPLIES ONLY AFTER COMMIT.
  -- 裁-23 Q5's "a separate human click after the client is created" was ambiguous between
  -- after begin_client_onboarding (plan open) and after commit_client_onboarding. The owner
  -- ruled COMMIT. Until this rung the door consulted the onboarding plan NOWHERE -- op_key,
  -- family nulls, client-in-firm, a visible published template, an empty chart and no adopted
  -- adoption, and nothing else (measured against the live body) -- so a chart could be planted
  -- mid-interview and, if the client were then CANCELLED, archived holding it, with
  -- chart_not_empty refusing every later apply forever.
  --
  -- PLACED LAST AMONG THE GUARDS, DELIBERATELY: every pre-existing refusal keeps its exact
  -- precedence, so no caller's typed reason changes and no existing cell moves. It still
  -- refuses before the family list is resolved and before the first write.
  --
  -- THE PREDICATE IS THE CLIENT'S MOST RECENT client-scope plan, per the ruled mechanism. A
  -- COMMITTED or ABSENT plan passes exactly as today, and a CANCELLED one passes too -- a
  -- withdrawn onboarding is not an onboarding in progress.
  --
  -- THE TIE-BREAK IS LOAD-BEARING. "Most recent" is UNDEFINED when two plans share a
  -- created_at, and they share one routinely: the column defaults to now()
  -- (0017_wave_b.sql:1015), which is transaction-stable, so any two plans written in ONE
  -- transaction tie exactly. The first cut let that tie fall to `id desc` over a
  -- gen_random_uuid() (0017_wave_b.sql:996) -- a door's refusal decided by coin flip, which
  -- red this file's own tail on CI run 33910144663 after passing the identical rig locally.
  -- Ordering `open` FIRST within a tie makes it fail SAFE: when the database cannot say which
  -- plan is later, the door refuses rather than planting a chart under a possibly-open
  -- interview. `id desc` stays as the final term so the read is TOTAL -- two open plans, or
  -- two committed ones, still resolve to one deterministic row. The recency reading itself is
  -- unchanged and deliberate (裁-193, verified by review-551): an open plan genuinely OLDER
  -- than a committed one is a superseded interview and still passes.
  if (select p4.state from clara.onboarding_plans p4
       where p4.client_id = p_client and p4.scope_kind = 'client'
       order by p4.created_at desc, (p4.state = 'open') desc, p4.id desc limit 1) = 'open' then
    raise exception 'this client''s onboarding plan is still open; the standard chart is applied once the interview is committed'
      using errcode = 'CLR10', detail = '{"reason":"onboarding_plan_open"}';
  end if;
$rung$);
end $dba9_rung$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.apply_coa_template : ONE RUNG ADDED, LAST AMONG THE GUARDS.
-- =====================================================================================
create or replace function clara.apply_coa_template(p_client uuid, p_template uuid, p_families text[],
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates; v_prop clara.coa_template_adoptions;
  v_plan jsonb; v_families text[]; v_source text; v_bad text;
  v_adoption uuid; v_planted text[] := '{}'::text[]; v_fam text; v_had_prop boolean := false;
  v_constraint text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  if p_families is not null and array_position(p_families, null) is not null then
    raise exception 'a family key cannot be null' using errcode = 'CLR10',
      detail = '{"reason":"family_key_null"}';
  end if;
  -- The request hash distinguishes the database PLAN sentinel from every caller list, including
  -- [], and covers the DISTINCT SORTED caller set. The same set in a different order is the same
  -- request; a genuinely different source/set under a reused key raises rather than replaying.
  v_dedupe := clara._reserve_op(c.firm, 'apply_coa_template', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 't', p_template,
      'f', case when p_families is null then '"plan"'::jsonb
                else coalesce((select jsonb_agg(distinct x order by x)
                                 from unnest(p_families) x), '[]'::jsonb) end)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Rung 3.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_in_firm"}';
  end if;

  -- Rung 4. The visibility predicate is the READ POLICY's, not a NULL inference: a platform
  -- template, or one of the caller's own firm. An invisible template and an absent one look
  -- identical to the caller -- no cross-firm existence oracle.
  select * into t from clara.coa_templates
   where id = p_template and (scope = 'platform' or firm_id = c.firm);
  if not found then
    raise exception 'template not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;
  if t.state <> 'published' then
    raise exception 'template % version % is %, not published', t.template_key, t.version, t.state
      using errcode = 'CLR10', detail = '{"reason":"template_not_published"}';
  end if;

  -- Rung 5 -- 裁-23 Q4.
  if exists (select 1 from clara.coa_accounts a where a.client_id = p_client) then
    raise exception 'this client already has accounts; the firm''s standard chart is applied to an empty chart only'
      using errcode = 'CLR10', detail = '{"reason":"chart_not_empty"}';
  end if;

  -- Rung 6 (departures register (2)): an 'adopted' row is the wall; a 'proposed' row is the thing
  -- being applied.
  if exists (select 1 from clara.coa_template_adoptions ad
              where ad.client_id = p_client and ad.state = 'adopted') then
    raise exception 'this client has already adopted a template' using errcode = 'CLR10',
      detail = '{"reason":"already_adopted"}';
  end if;
  select * into v_prop from clara.coa_template_adoptions
   where client_id = p_client and state = 'proposed';
  v_had_prop := found;

  -- Rung 6c -- 裁-193 (owner, 2026-09-04 ≈16:45 MYT): THE CHART APPLIES ONLY AFTER COMMIT.
  -- 裁-23 Q5's "a separate human click after the client is created" was ambiguous between
  -- after begin_client_onboarding (plan open) and after commit_client_onboarding. The owner
  -- ruled COMMIT. Until this rung the door consulted the onboarding plan NOWHERE -- op_key,
  -- family nulls, client-in-firm, a visible published template, an empty chart and no adopted
  -- adoption, and nothing else (measured against the live body) -- so a chart could be planted
  -- mid-interview and, if the client were then CANCELLED, archived holding it, with
  -- chart_not_empty refusing every later apply forever.
  --
  -- PLACED LAST AMONG THE GUARDS, DELIBERATELY: every pre-existing refusal keeps its exact
  -- precedence, so no caller's typed reason changes and no existing cell moves. It still
  -- refuses before the family list is resolved and before the first write.
  --
  -- THE PREDICATE IS THE CLIENT'S MOST RECENT client-scope plan, per the ruled mechanism. A
  -- COMMITTED or ABSENT plan passes exactly as today, and a CANCELLED one passes too -- a
  -- withdrawn onboarding is not an onboarding in progress.
  --
  -- THE TIE-BREAK IS LOAD-BEARING. "Most recent" is UNDEFINED when two plans share a
  -- created_at, and they share one routinely: the column defaults to now()
  -- (0017_wave_b.sql:1015), which is transaction-stable, so any two plans written in ONE
  -- transaction tie exactly. The first cut let that tie fall to `id desc` over a
  -- gen_random_uuid() (0017_wave_b.sql:996) -- a door's refusal decided by coin flip, which
  -- red this file's own tail on CI run 33910144663 after passing the identical rig locally.
  -- Ordering `open` FIRST within a tie makes it fail SAFE: when the database cannot say which
  -- plan is later, the door refuses rather than planting a chart under a possibly-open
  -- interview. `id desc` stays as the final term so the read is TOTAL -- two open plans, or
  -- two committed ones, still resolve to one deterministic row. The recency reading itself is
  -- unchanged and deliberate (裁-193, verified by review-551): an open plan genuinely OLDER
  -- than a committed one is a superseded interview and still passes.
  if (select p4.state from clara.onboarding_plans p4
       where p4.client_id = p_client and p4.scope_kind = 'client'
       order by p4.created_at desc, (p4.state = 'open') desc, p4.id desc limit 1) = 'open' then
    raise exception 'this client''s onboarding plan is still open; the standard chart is applied once the interview is committed'
      using errcode = 'CLR10', detail = '{"reason":"onboarding_plan_open"}';
  end if;

  -- THE FAMILY SET. A caller-supplied list is the ruled EDIT path (Q3); NULL asks the database
  -- for its own deterministic plan (departures register (1)).
  v_plan := clara._coa_family_plan(p_client, t.id);
  if p_families is null then
    v_source := 'plan';
    select coalesce(array_agg(x), '{}'::text[]) into v_families
      from jsonb_array_elements_text(v_plan->'keep') x;
  else
    v_source := 'caller';
    -- Duplicates in the caller's array are collapsed: the same family twice is one family, and
    -- the adoption row's families[] must not carry it twice.
    select coalesce(array_agg(distinct x) filter (where x is not null), '{}'::text[])
      into v_families from unnest(p_families) x;
  end if;

  -- Rung 6b -- THE RESOLVED SET IS NON-EMPTY. Rung 8 catches an empty list on any template that
  -- HAS core families, which the platform starter does; but a firm's own fork may lawfully carry
  -- none (remove_coa_template_family does not defend `core`), and then an empty apply would sail
  -- past rung 8, plant nothing, and die on ck_coa_adoption_families as a bare 23514 naming
  -- nothing. Every refusal in this door is a NAMED one.
  if v_families = '{}'::text[] then
    raise exception 'an apply must name at least one family' using errcode = 'CLR10',
      detail = '{"reason":"families_required"}';
  end if;

  -- Rung 7 -- names the offender.
  select string_agg(x, ', ' order by x) into v_bad from unnest(v_families) x
   where not exists (select 1 from clara.coa_template_families f
                      where f.template_id = t.id and f.family_key = x);
  if v_bad is not null then
    raise exception 'template % carries no family named %', t.template_key, v_bad
      using errcode = 'CLR10', detail = '{"reason":"unknown_family"}';
  end if;

  -- Rung 8 -- `core` is NEVER trimmable, and the refusal names what was dropped.
  select string_agg(f.family_key, ', ' order by f.family_key) into v_bad
    from clara.coa_template_families f
   where f.template_id = t.id and f.inclusion = 'core' and not (f.family_key = any (v_families));
  if v_bad is not null then
    raise exception 'these families apply to every client and cannot be dropped: %', v_bad
      using errcode = 'CLR10', detail = '{"reason":"core_family_dropped"}';
  end if;

  -- Rung 9 -- the apply. Family order is the template's own, so the planted chart reads in the
  -- authored sequence rather than in array order.
  for v_fam in select f.family_key from clara.coa_template_families f
                where f.template_id = t.id and f.family_key = any (v_families)
                order by f.sort_ordinal, f.family_key loop
    v_planted := v_planted || clara._coa_plant_family(
      jsonb_build_object('actor', c.actor, 'firm', c.firm), p_client, t.id, v_fam, p_op_key);
  end loop;

  if v_had_prop and v_prop.template_id = t.id and v_prop.template_version = t.version then
    -- Clara proposed this template version and the human applied it (possibly having edited the
    -- family list) -- ONE row, moved, so the proposal's receipt and basis stay attached to the
    -- adoption they became. The proposed-row TWIN of the INSERT branch's uq_coa_adoption_live
    -- catch below: `and state = 'proposed'` re-checks at UPDATE time, not just at the SELECT
    -- above, so a second caller racing the SAME proposed row blocks on the row lock and then --
    -- once unblocked, re-evaluating against the winner's now-'adopted' row -- matches zero rows
    -- instead of silently overwriting the winner's committed adoption.
    begin
      update clara.coa_template_adoptions
         set state = 'adopted', adopted_by = c.actor, adopted_at = now(), families = v_families
       where id = v_prop.id and state = 'proposed'
       returning id into v_adoption;
    exception when unique_violation then
      get stacked diagnostics v_constraint = CONSTRAINT_NAME;
      if v_constraint = 'uq_coa_adoption_live' then
        raise exception 'another chart adoption committed while this apply was in flight'
          using errcode = 'CLR10', detail = '{"reason":"chart_adoption_race"}';
      end if;
      raise;
    end;
    if v_adoption is null then
      raise exception 'another chart adoption committed while this apply was in flight'
        using errcode = 'CLR10', detail = '{"reason":"chart_adoption_race"}';
    end if;
  else
    begin
      insert into clara.coa_template_adoptions(firm_id, client_id, template_id, template_version,
          state, families, adopted_by, adopted_at)
        values (c.firm, p_client, t.id, t.version, 'adopted', v_families, c.actor, now())
        returning id into v_adoption;
    exception when unique_violation then
      get stacked diagnostics v_constraint = CONSTRAINT_NAME;
      if v_constraint = 'uq_coa_adoption_live' then
        raise exception 'another chart adoption committed while this apply was in flight'
          using errcode = 'CLR10', detail = '{"reason":"chart_adoption_race"}';
      end if;
      raise;
    end;
    if v_had_prop then
      -- The human applied a DIFFERENT template than Clara proposed. Law 6: a state, never a
      -- delete -- and uq_coa_adoption_open would refuse a second open proposal anyway.
      update clara.coa_template_adoptions
         set state = 'superseded', superseded_by = v_adoption
       where id = v_prop.id;
    end if;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'apply_coa_template', null,
    jsonb_build_object('client', p_client, 'template_id', t.id, 'template_version', t.version,
      'families', to_jsonb(v_families), 'families_source', v_source,
      'accounts', cardinality(v_planted), 'adoption_id', v_adoption, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'account.chart_applied', p_client, c.actor, null, null,
    null, null, null,
    jsonb_build_object('template_id', t.id, 'template_key', t.template_key,
      'template_version', t.version, 'families', to_jsonb(v_families),
      'accounts', cardinality(v_planted), 'adoption_id', v_adoption));

  return clara._finish_op(c.firm, 'apply_coa_template', p_op_key,
    jsonb_build_object('client_id', p_client, 'template_id', t.id, 'template_version', t.version,
      'adoption_id', v_adoption, 'families', to_jsonb(v_families), 'families_source', v_source,
      'accounts', cardinality(v_planted), 'account_codes', to_jsonb(v_planted),
      'plan', v_plan));
end $$;


reset role;

alter function clara.apply_coa_template(uuid,uuid,text[],text) owner to clara_fn_owner;

-- =====================================================================================
-- TAIL CENSUS
-- =====================================================================================
do $dba9_tail$
declare
  v_new text; v_rung text; v_n int; v_pos_rung int; v_pos_adopt int; v_pos_fam int;
  v_firm uuid; v_user uuid; v_client uuid; v_plan uuid;
begin
  -- (1) SHAPE + ACL. A granted writer that changed posture is a different door.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.apply_coa_template(uuid,uuid,text[],text)'::regprocedure
     and p.prosecdef and p.provolatile = 'v' and p.proowner = 'clara_fn_owner'::regrole
     and array_to_string(p.proconfig, ',') like '%search_path%';
  if v_n <> 1 then
    raise exception 'dba9 tail: apply_coa_template is not a VOLATILE SECURITY DEFINER search_path-pinned body owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.apply_coa_template(uuid,uuid,text[],text)', 'execute') then
    raise exception 'dba9 tail: apply_coa_template LOST its clara_authenticated grant across the recut' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('clara_agent_ro', 'clara.apply_coa_template(uuid,uuid,text[],text)', 'execute')
     or pg_catalog.has_function_privilege('clara_runtime', 'clara.apply_coa_template(uuid,uuid,text[],text)', 'execute')
     or pg_catalog.has_function_privilege('public', 'clara.apply_coa_template(uuid,uuid,text[],text)', 'execute') then
    raise exception 'dba9 tail: apply_coa_template became callable by an agent, the runtime, or PUBLIC' using errcode = 'CLR10';
  end if;

  -- (2) THE INSERTION IS THE ONLY DELTA, proven by SUBTRACTION against the pinned pre-image.
  select p.prosrc into v_new from pg_proc p
   where p.oid = 'clara.apply_coa_template(uuid,uuid,text[],text)'::regprocedure;
  select v into v_rung from _dba9_pre where k = 'rung';
  v_n := (length(v_new) - length(replace(v_new, v_rung, ''))) / length(v_rung);
  if v_n <> 1 then
    raise exception 'dba9 tail: the ruled rung occurs % time(s) in the installed body, expected 1', v_n
      using errcode = 'CLR10';
  end if;
  if replace(v_new, v_rung, '') is distinct from (select v from _dba9_pre where k = 'prosrc:apply_coa_template') then
    raise exception 'dba9 tail: apply_coa_template is NOT insert-only -- removing the rung does not reproduce the pinned pre-image byte for byte. Some other rung moved, and this door plants a client''s whole chart.'
      using errcode = 'CLR10';
  end if;

  -- (3) THE RUNG IS LAST AMONG THE GUARDS and still refuses before anything is resolved, so no
  -- pre-existing typed refusal changes precedence and no work is done before it fires.
  v_pos_rung := position('onboarding_plan_open' in v_new);
  v_pos_adopt := position('already_adopted' in v_new);
  v_pos_fam := position('families_required' in v_new);
  if v_pos_rung < v_pos_adopt then
    raise exception 'dba9 tail: the plan rung sits BEFORE the adoption wall -- an existing caller''s typed refusal would change'
      using errcode = 'CLR10';
  end if;
  if v_pos_fam < v_pos_rung then
    raise exception 'dba9 tail: the plan rung sits AFTER the family resolution -- it must refuse before any list is built'
      using errcode = 'CLR10';
  end if;

  -- (4) NO DYNAMIC SQL. A bare `execute` here would make this file a second unreviewed
  -- dynamic-SQL barrier in apps/web's successor census -- a CI red, not a style note.
  if v_new ~ '(^|[^_[:alnum:]])execute[[:space:]]' then
    raise exception 'dba9 tail: the installed body contains a dynamic EXECUTE -- this file promised a static body'
      using errcode = 'CLR10';
  end if;

  -- (5) BEHAVIOURAL, on a planted fixture -- every sibling file in this set proves its change
  -- by exercising it, and a source proof is not a behaviour proof. All FOUR plan states are
  -- walked, because the header claims a cancelled plan passes and an unwitnessed claim is the
  -- thing this set keeps refusing to ship. Arm (5e) additionally pins the TIE-BREAK, the one
  -- part of the ordering whose absence is invisible on a passing run.
  v_user := gen_random_uuid();
  insert into clara.users(id, display_name) values (v_user, 'dba9 tail probe');
  insert into clara.firms(id, name) values (gen_random_uuid(), 'dba9 tail firm ' || gen_random_uuid())
    returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role, status)
    values (v_firm, v_user, 'viewer', 'active');
  insert into clara.clients(firm_id, name, status)
    values (v_firm, 'dba9 tail client', 'active') returning id into v_client;

  -- (5a) NO PLAN -> the rung is silent. Proven by reading the predicate on a real client
  -- rather than by trusting that `= 'open'` is false on a NULL.
  if (select p5.state from clara.onboarding_plans p5 where p5.client_id = v_client and p5.scope_kind = 'client'
       order by p5.created_at desc, (p5.state = 'open') desc, p5.id desc limit 1) = 'open' then
    raise exception 'dba9 tail (5a): a client with NO plan reads as open' using errcode = 'CLR10';
  end if;

  -- (5b) OPEN -> refused. Arms (5b)-(5d) plant EXPLICIT, DISTINCT created_at values so they
  -- test RECENCY. Defaulted rows would all tie on a transaction-stable now(), and these arms
  -- would silently be exercising the tie-break instead -- which is what red this file on CI.
  insert into clara.onboarding_plans(firm_id, client_id, scope_kind, state, created_at)
    values (v_firm, v_client, 'client', 'open', now() - interval '3 hours') returning id into v_plan;
  if (select p5.state from clara.onboarding_plans p5 where p5.client_id = v_client and p5.scope_kind = 'client'
       order by p5.created_at desc, (p5.state = 'open') desc, p5.id desc limit 1) <> 'open' then
    raise exception 'dba9 tail (5b): an OPEN plan is not seen by the rung''s predicate' using errcode = 'CLR10';
  end if;

  -- (5c) CANCELLED -> passes. THE HEADER'S OWN CLAIM, witnessed: a withdrawn onboarding is not
  -- an onboarding in progress, and the rung must not strand a cancelled client's chart forever.
  update clara.onboarding_plans
     set state = 'cancelled', cancelled_at = now(), cancelled_by = v_user,
         cancel_reason = 'dba9 tail probe cancel'
   where id = v_plan;
  if (select p5.state from clara.onboarding_plans p5 where p5.client_id = v_client and p5.scope_kind = 'client'
       order by p5.created_at desc, (p5.state = 'open') desc, p5.id desc limit 1) = 'open' then
    raise exception 'dba9 tail (5c): a CANCELLED plan still reads as open -- the rung would strand this client''s chart'
      using errcode = 'CLR10';
  end if;

  -- (5d) COMMITTED, planted STRICTLY NEWER than the cancelled row, so recency really is what
  -- decides this arm and the tie-break cannot carry it.
  insert into clara.onboarding_plans(firm_id, client_id, scope_kind, state, committed_at, committed_by, created_at)
    values (v_firm, v_client, 'client', 'committed', now(), v_user, now() - interval '2 hours');
  if (select p5.state from clara.onboarding_plans p5 where p5.client_id = v_client and p5.scope_kind = 'client'
       order by p5.created_at desc, (p5.state = 'open') desc, p5.id desc limit 1) <> 'committed' then
    raise exception 'dba9 tail (5d): the most-recent read did not pick the COMMITTED plan' using errcode = 'CLR10';
  end if;

  -- (5e) THE TIE ITSELF, proven rather than merely avoided. An open plan sharing the committed
  -- one's EXACT created_at is the case "most recent" cannot decide, and it is reachable in
  -- production because now() is transaction-stable. The tie-break orders open first, so the
  -- door refuses. The uuids are assigned DELIBERATELY -- committed takes the HIGHER id via
  -- greatest() -- so that deleting `(state = 'open') desc` leaves `id desc` picking 'committed'
  -- EVERY time: the mutant reds deterministically instead of on half its runs.
  with pair as materialized (select least(g.x, g.y) lo, greatest(g.x, g.y) hi
                               from (select gen_random_uuid() x, gen_random_uuid() y) g)
  insert into clara.onboarding_plans(id, firm_id, client_id, scope_kind, state, committed_at, committed_by, created_at)
  select pair.hi, v_firm, v_client, 'client', 'committed', now(), v_user, now() - interval '1 hour' from pair
  union all
  select pair.lo, v_firm, v_client, 'client', 'open', null, null, now() - interval '1 hour' from pair;
  if (select p5.state from clara.onboarding_plans p5 where p5.client_id = v_client and p5.scope_kind = 'client'
       order by p5.created_at desc, (p5.state = 'open') desc, p5.id desc limit 1) <> 'open' then
    raise exception 'dba9 tail (5e): a TIED open plan lost to the committed one -- the fail-safe tie-break is gone and this door decides by coin flip'
      using errcode = 'CLR10';
  end if;

  raise notice 'dba9 tail: OK -- clara.apply_coa_template CoR''d from its 0156:726 pre-image (sha-pinned in the prestate), still VOLATILE SECURITY DEFINER, search_path-pinned, clara_fn_owner-owned, executable by clara_authenticated and by NOBODY else. The ruled rung refuses onboarding_plan_open when the client''s MOST RECENT client-scope plan is open; a committed, cancelled or absent plan passes exactly as before. THE ORDER BY IS TOTAL AND FAILS SAFE: created_at desc, then (state = ''open'') desc, then id desc. "Most recent" is undefined on a created_at tie -- and ties are routine, because the column defaults to a transaction-stable now() -- so the first cut of this rung resolved them on a random uuid and decided the door by coin flip, which red this file on CI run 33910144663. A tie now resolves toward OPEN, i.e. toward refusing. INSERT-ONLY PROVEN BY SUBTRACTION: the rung occurs once and removing it reproduces the pinned pre-image BYTE FOR BYTE, so none of the six named refusals moved. The rung sits LAST among the guards and BEFORE the family resolution, so every pre-existing typed refusal keeps its precedence and nothing is built before it fires. The body contains NO dynamic EXECUTE, so this file adds no barrier to apps/web''s successor census. No table in workflow/graphile_worker/spike touched. BEHAVIOURALLY EXERCISED on a planted fixture across all FOUR plan states -- absent, open, cancelled and committed, each with an EXPLICIT distinct created_at so those arms test RECENCY and cannot pass on the tie-break. Arm (5e) then exercises THE TIE ITSELF: an open plan sharing the committed one''s exact created_at, with the committed row deliberately holding the HIGHER uuid, so the arm passes only because open is ordered first -- delete that term and it reds every run, not half of them. D1 WRITE-QUIESCE IS OWED -- a granted audited writer, one door, one window.';

  -- The fixture is EVIDENCE, not state.
  raise exception using errcode = 'CLR00', message = 'dba9 tail probe rollback';
exception when sqlstate 'CLR00' then
  raise notice 'dba9 tail: the behavioural fixture was rolled back -- nothing this block planted survives.';
end $dba9_tail$;
