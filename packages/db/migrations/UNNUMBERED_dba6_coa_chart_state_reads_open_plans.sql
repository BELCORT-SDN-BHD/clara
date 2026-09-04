-- =====================================================================================
-- DB-A / 6 of 7 -- clara.coa_chart_state READS AN OPEN PLAN'S ANSWERED DECISION (H-29).
--
-- THE DEFECT, and the reported cause is NOT it. The handover reads "the CoA apply row says
-- undecided while the plan is open" and the apps/web helper was suspected. The web helper is
-- faithful: apps/web/lib/onboarding/coa.ts:89 maps r.seed_decision, the row's own key is
-- seed_decision, the interview writes answer:{seed} and the DB reads i.answer->>'seed'. The
-- field names agree. The verdict is DB-computed and the cause is a STATE PREDICATE inside
-- clara.coa_chart_state's `dec` CTE (0156:1080-1088, the only definition -- nothing later
-- re-cuts it, and a full 0001->0164 rig replay pins the sha in the prestate below):
--     where p2.client_id = p_client and p2.scope_kind = 'client'
--       and p2.state = 'committed'
-- While onboarding is IN PROGRESS the plan is `open`, so `dec` returns no row, dec.seed is
-- NULL, and the CASE falls to its final `else 'undecided'`.
--
-- WHY IT SHOWS UP AT ALL: the apply control is mounted as an extraControl on the
-- coa_chart_apply row INSIDE the live onboarding checklist
-- (apps/web/components/clara/OnboardingChecklistCard.tsx:283-290), and the interview mints
-- that row while the plan is still open. So on the HAPPY PATH the row is on screen, the
-- decision IS answered, and the DB is structurally unable to say so until commit. 0156's own
-- header states the intent -- "reads the item BY NAME out of the client's latest COMMITTED
-- plan" -- so this is a genuine collision between 0156's read and the control's placement,
-- not a typo.
--
-- THE FIX IS A WIDENING WITH A PRECEDENCE, NOT A LOOSENING. A COMMITTED decision still
-- OUTRANKS an open one for the same client, always: the ORDER BY sorts committed first and
-- only then by recency, so a client who committed one answer and later re-opened a plan with
-- a different one still reads the committed answer. An open plan's decision is used ONLY
-- when no committed one exists.
--
-- A CANCELLED PLAN IS NOT READ. `state in ('committed','open')` deliberately excludes
-- 'cancelled' (onboarding_plans_state_check admits exactly those three): a withdrawn
-- onboarding's answer is not a decision anybody stands behind.
--
-- AN OPEN-PLAN DECISION IS NOT THE SAME FACT AS A COMMITTED ONE, and the read says so rather
-- than quietly presenting one as the other. seed_decision_plan_state joins the payload
-- carrying 'committed' or 'open' (or NULL when there is no decision at all), so the card can
-- render "decided in the interview, not yet committed" instead of asserting a settled state.
-- THAT KEY IS THE HONESTY HALF OF THIS CHANGE and the web lane owes it a sentence -- the same
-- discipline 0156's own header applies to lhdn_mpers_standard.
--
-- SIGNATURE, VOLATILITY, LANGUAGE AND ACL ARE ALL UNCHANGED, so the clara_authenticated
-- grant at 0156:1232 is preserved by construction (CREATE OR REPLACE keeps the ACL).
--
-- D1: a STABLE SQL reader, not an audited writer. No write-quiesce window owed.
-- =====================================================================================

-- Precautionary, not load-bearing: one reader recut, no data movement.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba6_pre$
declare v_src text; v_got text; v_def text;
begin
  if to_regprocedure('clara.coa_chart_state(uuid)') is null then
    raise exception 'dba6 prestate: clara.coa_chart_state does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.coa_chart_state(uuid)'::regprocedure;
  v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  -- Measured on a full 0001->0164 rig replay while authoring this file (DB-A lane,
  -- 2026-09-04). 0156:1076 is the only definition of this body.
  if v_got <> '1d142642e1b030f28ed0d0385cb999aa3a569e33257ed0b61cdc276fc6bbfae8' then
    raise exception 'dba6 prestate: coa_chart_state prosrc sha256 is % -- not the 0156 body this file was authored against. STOP.', v_got
      using errcode = 'CLR10';
  end if;
  -- THE DEFECT, witnessed as present rather than assumed.
  if position('p2.state = ''committed''' in v_src) = 0 then
    raise exception 'dba6 prestate: the live body does not carry the committed-only plan predicate H-29 names -- the defect this file repairs is not present as described'
      using errcode = 'CLR10';
  end if;
  if position('seed_decision_plan_state' in v_src) <> 0 then
    raise exception 'dba6 prestate: coa_chart_state already reports seed_decision_plan_state -- already applied to this database'
      using errcode = 'CLR10';
  end if;
  -- The state vocabulary this file's widening depends on. If 'open' were not an admitted
  -- plan state the widening would read nothing, and if 'cancelled' were absent the deliberate
  -- exclusion below would be describing a state that cannot occur.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'onboarding_plans'
     and con.conname = 'onboarding_plans_state_check';
  if v_def is null or position('''open''' in v_def) = 0 or position('''cancelled''' in v_def) = 0 then
    raise exception 'dba6 prestate: onboarding_plans_state_check does not admit both ''open'' and ''cancelled'' (def: %) -- the widening and its exclusion are both written against a vocabulary that is not live', coalesce(v_def, '<absent>')
      using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.coa_chart_state(uuid)', 'execute') then
    raise exception 'dba6 prestate: clara_authenticated cannot execute coa_chart_state -- the ACL this file promises to preserve is not there to preserve'
      using errcode = 'CLR10';
  end if;
  raise notice 'dba6 prestate: clean -- coa_chart_state matches its authored pre-image sha, still carries the committed-only predicate, does not yet report the plan state, and holds its clara_authenticated grant.';
end $dba6_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.coa_chart_state.
--
-- 0156:1076's body verbatim except the `dec` CTE's state predicate, its ORDER BY, one
-- projected column and one returned key. Every other CTE, every arm of the six-state CASE
-- and every comment is unmoved.
-- =====================================================================================
create or replace function clara.coa_chart_state(p_client uuid) returns jsonb
  language sql stable set search_path = clara, pg_temp as $$
  with cl as (select c.id, c.name from clara.clients c where c.id = p_client),
  dec as (
    -- H-29 (handover 2026-09-04): COMMITTED FIRST, THEN OPEN -- never open INSTEAD OF
    -- committed. The apply control is mounted inside the live onboarding checklist, so on
    -- the happy path the decision is answered while the plan is still `open`; the old
    -- `p2.state = 'committed'` predicate made the DB structurally unable to say so and the
    -- card read `undecided` on a client who had just decided.
    --
    -- THE ORDER BY IS THE PRECEDENCE and it is load-bearing: (p2.state = 'committed') desc
    -- puts every committed row ahead of every open one, so a client who committed one answer
    -- and later re-opened a plan with a different one still reads the COMMITTED answer. An
    -- open plan's decision is used only when no committed one exists.
    --
    -- 'cancelled' is deliberately NOT admitted: a withdrawn onboarding's answer is not a
    -- decision anybody stands behind.
    select i.answer->>'seed' as seed, p2.committed_at, p2.state as plan_state
      from clara.onboarding_plans p2
      join clara.onboarding_plan_items i on i.plan_id = p2.id
     where p2.client_id = p_client and p2.scope_kind = 'client'
       and p2.state in ('committed', 'open')
       and i.item_key = 'coa_seed_decision' and i.state in ('answered','resolved')
     order by (p2.state = 'committed') desc, p2.committed_at desc nulls last, i.answered_at desc
     limit 1),
  ad as (
    select a.id, a.state, a.template_id, a.template_version, a.families, a.adopted_at
      from clara.coa_template_adoptions a
     where a.client_id = p_client and a.state in ('adopted','proposed')
     order by case a.state when 'adopted' then 0 else 1 end
     limit 1),
  ch as (select count(*)::int as accounts from clara.coa_accounts a where a.client_id = p_client)
  select jsonb_build_object(
    'client_id', cl.id,
    'seed_decision', dec.seed,
    'seed_decision_at', dec.committed_at,
    -- H-29's HONESTY HALF: 'committed' or 'open' (NULL when there is no decision at all).
    -- An open-plan decision is a real answer but not a settled fact, and a reader that
    -- presented the two identically would be asserting a commitment nobody made.
    'seed_decision_plan_state', dec.plan_state,
    'seed_wants_template', dec.seed in ('firm_template','lhdn_mpers_standard'),
    'accounts', ch.accounts,
    'adoption_id', ad.id, 'adoption_state', ad.state,
    'template_id', ad.template_id, 'template_version', ad.template_version,
    'families', to_jsonb(ad.families), 'adopted_at', ad.adopted_at,
    'state', case
      when ad.state = 'adopted' then 'adopted'
      when ch.accounts > 0 then 'off_standard'
      when dec.seed = 'manual' then 'declined'
      when dec.seed in ('firm_template','lhdn_mpers_standard') then 'pending'
      else 'undecided' end)
    from cl cross join ch left join dec on true left join ad on true;
$$;

reset role;

alter function clara.coa_chart_state(uuid) owner to clara_fn_owner;

-- =====================================================================================
-- TAIL CENSUS -- behavioural, all four arms.
-- =====================================================================================
do $dba6_tail$
declare
  v_src text; v_n int;
  v_firm uuid; v_user uuid; v_client uuid; v_plan uuid; v_plan2 uuid; v_r jsonb;
begin
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.coa_chart_state(uuid)'::regprocedure
     and p.provolatile = 's' and p.prolang = (select oid from pg_language where lanname = 'sql')
     and p.proowner = 'clara_fn_owner'::regrole
     and array_to_string(p.proconfig, ',') like '%search_path%';
  if v_n <> 1 then
    raise exception 'dba6 tail: coa_chart_state is not the STABLE sql search_path-pinned body it was' using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.coa_chart_state(uuid)', 'execute') then
    raise exception 'dba6 tail: coa_chart_state LOST its clara_authenticated grant across the recut' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('public', 'clara.coa_chart_state(uuid)', 'execute') then
    raise exception 'dba6 tail: coa_chart_state became PUBLIC-callable' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.coa_chart_state(uuid)'::regprocedure;
  if position('p2.state in (''committed'', ''open'')' in v_src) = 0
     or position('(p2.state = ''committed'') desc' in v_src) = 0
     or position('seed_decision_plan_state' in v_src) = 0 then
    raise exception 'dba6 tail: the widening, its precedence, or the plan-state key is missing from the installed body'
      using errcode = 'CLR10';
  end if;
  -- Read IN CODE, never raw: this file's own header explains why 'cancelled' is excluded, so
  -- a raw scan would find the word in a comment and refuse a body that is correct (0146's
  -- HIGH-1 discipline, applied in the direction that matters here).
  if position('''cancelled''' in regexp_replace(v_src, '--[^\n]*', '', 'g')) <> 0 then
    raise exception 'dba6 tail: the body ADMITS a cancelled plan in code -- a withdrawn onboarding''s answer is not a decision'
      using errcode = 'CLR10';
  end if;

  -- BEHAVIOURAL. Fixture shapes are 0146:426-436's probe idiom.
  v_user := gen_random_uuid();
  insert into clara.users(id, display_name) values (v_user, 'dba6 tail probe');
  insert into clara.firms(id, name) values (gen_random_uuid(), 'dba6 tail firm ' || gen_random_uuid())
    returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role, status)
    values (v_firm, v_user, 'viewer', 'active');
  insert into clara.clients(firm_id, name, status)
    values (v_firm, 'dba6 tail client', 'active') returning id into v_client;

  -- ARM 1 -- THE ABSENCE ARM MUST NOT MOVE. No plan, no decision, empty chart: 'undecided'.
  v_r := clara.coa_chart_state(v_client);
  if v_r ->> 'state' <> 'undecided' or (v_r ? 'seed_decision_plan_state') is not true
     or v_r ->> 'seed_decision_plan_state' is not null then
    raise exception 'dba6 tail (arm 1): a client with NO decision reads state=% / plan_state=% -- the absence arm must stay undecided with a NULL plan state (payload %)',
      v_r ->> 'state', v_r ->> 'seed_decision_plan_state', v_r using errcode = 'CLR10';
  end if;

  -- ARM 2 -- H-29 ITSELF. An OPEN plan with an ANSWERED decision.
  insert into clara.onboarding_plans(firm_id, client_id, scope_kind, state)
    values (v_firm, v_client, 'client', 'open') returning id into v_plan;
  insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
      state, answer, answered_by, answered_at)
    values (v_plan, v_firm, 'must_ask', 'coa_seed_decision', 'dba6 probe', 'answered',
      '{"seed":"firm_template"}'::jsonb, v_user, now());
  v_r := clara.coa_chart_state(v_client);
  if v_r ->> 'state' <> 'pending' or v_r ->> 'seed_decision' <> 'firm_template' then
    raise exception 'dba6 tail (arm 2): an OPEN plan''s answered decision reads state=% / seed=% -- H-29 is not fixed (payload %)',
      v_r ->> 'state', v_r ->> 'seed_decision', v_r using errcode = 'CLR10';
  end if;
  if v_r ->> 'seed_decision_plan_state' <> 'open' then
    raise exception 'dba6 tail (arm 2): the read does not say the decision is only OPEN (plan_state=%) -- an uncommitted answer would be presented as settled', v_r ->> 'seed_decision_plan_state'
      using errcode = 'CLR10';
  end if;

  -- ARM 3 -- PRECEDENCE. A COMMITTED plan carrying a DIFFERENT answer must outrank the open
  -- one, regardless of which was answered later. Without the ORDER BY's first term this cell
  -- reads 'firm_template' and the widening would have silently demoted a committed decision.
  insert into clara.onboarding_plans(firm_id, client_id, scope_kind, state,
      committed_at, committed_by)
    values (v_firm, v_client, 'client', 'committed', now() - interval '1 day', v_user)
    returning id into v_plan2;
  insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
      state, answer, answered_by, answered_at)
    values (v_plan2, v_firm, 'must_ask', 'coa_seed_decision', 'dba6 probe committed', 'answered',
      '{"seed":"manual"}'::jsonb, v_user, now() - interval '1 day');
  v_r := clara.coa_chart_state(v_client);
  if v_r ->> 'seed_decision' <> 'manual' or v_r ->> 'seed_decision_plan_state' <> 'committed' then
    raise exception 'dba6 tail (arm 3) CONTROL: a COMMITTED decision did not outrank an OPEN one (seed=%, plan_state=%) -- the widening demoted a committed fact',
      v_r ->> 'seed_decision', v_r ->> 'seed_decision_plan_state' using errcode = 'CLR10';
  end if;
  if v_r ->> 'state' <> 'declined' then
    raise exception 'dba6 tail (arm 3): the committed ''manual'' decision reads state=%, expected declined', v_r ->> 'state'
      using errcode = 'CLR10';
  end if;

  -- ARM 4 -- A CANCELLED PLAN IS NOT A DECISION. Cancel both plans; the read falls back to
  -- 'undecided' rather than reading a withdrawn onboarding's answer.
  update clara.onboarding_plans
     set state = 'cancelled', committed_at = null, committed_by = null,
         cancelled_at = now(), cancelled_by = v_user, cancel_reason = 'dba6 probe cancel'
   where id in (v_plan, v_plan2);
  v_r := clara.coa_chart_state(v_client);
  if v_r ->> 'state' <> 'undecided' or v_r ->> 'seed_decision' is not null then
    raise exception 'dba6 tail (arm 4) CONTROL: a CANCELLED plan''s answer is still being read (state=%, seed=%)',
      v_r ->> 'state', v_r ->> 'seed_decision' using errcode = 'CLR10';
  end if;

  raise notice 'dba6 tail: OK -- clara.coa_chart_state CoR''d from its 0156:1076 pre-image (sha-pinned in the prestate), still a STABLE sql body, search_path-pinned, clara_fn_owner-owned, executable by clara_authenticated and not by PUBLIC; signature, language and volatility all unmoved so the 0156:1232 ACL is preserved by construction. BEHAVIOURALLY EXERCISED on all four arms: a client with NO decision still reads undecided with a NULL plan state (the absence arm did not become ''pending''); an OPEN plan''s answered coa_seed_decision now reads pending/firm_template and SAYS seed_decision_plan_state=open, where it read undecided before; a COMMITTED decision carrying a different answer OUTRANKS the open one and reads declined/manual/committed (the precedence control -- without the ORDER BY''s first term this arm would have demoted a committed fact); and a CANCELLED plan''s answer is not read at all. THE WEB LANE OWES seed_decision_plan_state A SENTENCE: an open-plan decision is a real answer but not a settled one, and the card must say so rather than presenting it as committed. No table in workflow/graphile_worker/spike touched. D1: a STABLE reader, no write-quiesce window owed.';

  raise exception using errcode = 'CLR00', message = 'dba6 tail probe rollback';
exception when sqlstate 'CLR00' then
  raise notice 'dba6 tail: the behavioural fixture was rolled back -- nothing this block planted survives.';
end $dba6_tail$;
