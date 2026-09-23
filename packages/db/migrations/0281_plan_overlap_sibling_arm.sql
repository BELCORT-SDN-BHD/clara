-- 0281_plan_overlap_sibling_arm -- #909: `clara._plan_overlap_warning` GAINS A SECOND ARM so the
-- accounting-plan overlap advisory names an overlapping SIBLING PLAN, not only a legacy 0045
-- adjustment template. Body recut: the existing template arm is UNCHANGED; a new arm scans every
-- OTHER live (active or paused) `clara.accounting_plans` row of the same client whose current
-- revision's basis lines intersect the basis being evaluated, and both arms are merged into the
-- ONE `templates` list the three plan-creating doors and their web forms already render, so no
-- door and no form needs a single line changed. No signature change, no new relation, no new door.
-- =====================================================================================
-- Spec of record: issue #909, Agent Brief (2026-09-18T00:00:00Z triage comment, re-scoped by the
-- 2026-09-18 owner ruling on #788 recorded in the same thread -- the newest and only live Agent
-- Brief on the ticket). #909 was originally filed wider (a cross-lane direction, plan vs 0045
-- template, and a refuse-vs-advise question); the owner's #788 ruling retires the whole 0045 lane
-- in three tracer-bullet tickets (#927 -> #928 -> #929) and re-scopes #909 to exactly the
-- sibling-plan half, which is independent of that retirement. #929 ("blueprint and vocabulary")
-- drops the template arm entirely when the 0045 lane closes; until then both arms live side by
-- side in this ONE function, which is why this file recuts it rather than adding a second one.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE: THE ADVISORY WAS ONE-DIRECTIONAL AND HALF-BLIND.
--
-- `clara._plan_overlap_warning` (0193:1155) has scanned `clara.adjustment_templates` since the
-- plan lane's own birth, so a plan created over a live 0045 template's accounts has always been
-- warned. It has NEVER scanned `clara.accounting_plans` itself: an accrual plan (`reversing_
-- journal`) and an amortisation plan (`amortisation_schedule`) on the same account -- the exact
-- shape the Agent Brief's own "Current behavior" names -- warn about NEITHER each other NOR
-- anything else, because nothing on the plan side ever looked at a sibling plan at all. The
-- warning is still, and remains, ADVISORY -- migration 0193's own header records the deliberate
-- ruling that a firm may legitimately run two schedules against one account, and #909's Agent
-- Brief repeats it ("Still advisory") -- so this file widens WHO is named, never adds a refusal.
--
-- =====================================================================================
-- WHY BOTH ARMS LAND IN THE SAME `templates` LIST, UNDER THE SAME `kind` WHEN A TEMPLATE MATCHES.
--
-- The three plan-creating doors (`clara.create_accounting_plan` directly for all three kinds;
-- `clara.create_accrual_adjustment`, which calls `create_accounting_plan` directly at 0222:1213;
-- `clara.create_prepayment_schedule`, which calls it directly at 0223:1282, "THE PLAN. Through
-- 0193's OWN door") and their web forms (`apps/web/components/{plans,accruals,prepayments}-form.
-- tsx`) all read `overlap_warning.templates.map((x) => x.name)` and render it as a persistent
-- Alert -- NONE of them branch on `overlap_warning.kind`. Folding a sibling plan's entry into the
-- SAME `templates` array, using the SAME per-item shape a template entry already carries (`name`
-- and `accounts`, so the existing render code needs no change to show it; `cadence` reused as the
-- schedule's own frequency rather than invented per source; `template_id` kept literal for a
-- template entry and `plan_id` used honestly for a plan entry, since inventing a shared id field
-- name across two different kinds of row would be the dishonest half of this file), is therefore
-- what makes "the three plan doors and their forms render the widened warning unchanged" (the
-- Agent Brief's own line) literally true: nothing downstream of this function needs to change for
-- a human to SEE the new warning.
--
-- `kind` keeps its literal value `'adjustment_template_overlap'` whenever ANY template row
-- matches (byte-for-byte what `p640.schedule.overlap` in accounting-plans.test.mjs already
-- asserts, unedited by this file), and only reads `'accounting_plan_overlap'` when the match set
-- is purely sibling plans. A basis that overlaps BOTH a live template and a sibling plan at once
-- keeps the template's own `kind` label and gets both entries in the same list -- a transitional
-- imprecision this file states rather than hides, accepted because (a) a hosted census the same
-- day #788 was decided found ZERO rows in `clara.adjustment_templates` (any status), so the
-- combined case has no live occurrence to mislead, and (b) #929 deletes the whole template arm
-- shortly, at which point `kind` only ever means `'accounting_plan_overlap'` and this note is
-- moot. Inventing a third combined label for a today-empty, soon-deleted case was judged not
-- worth the complexity; `tests/plan-overlap-sibling-arm.test.mjs`'s own `p909.combined-with-
-- template` cell drives this exact combination and pins the choice.
--
-- =====================================================================================
-- WHY THE PLAN BEING EVALUATED EXCLUDES ITSELF BY BASIS IDENTITY, NOT BY ID.
--
-- `_plan_overlap_warning(p_client, p_basis)` carries no plan id, and this file does not add one:
-- the Agent Brief's own "Key interfaces" line names only this function for change and says "the
-- three plan-creating doors ... unchanged", so widening the signature and editing every call site
-- to pass its own new id was out of scope by the ticket's own words, not an oversight. Every
-- existing call site (`create_accounting_plan` 0193:1552, `revise_accounting_plan` 0193:1751,
-- `_accrual_plan_core` 0222:1045 -- all THREE pinned below as non-regression, byte-for-byte
-- unmoved) already writes the row this call is FOR -- inserting a brand-new plan and revision, or
-- superseding the live revision with a freshly-inserted one carrying the SAME `p_basis` the call
-- passes -- strictly BEFORE it reaches this function. The row being evaluated therefore always
-- carries `r.basis = p_basis`, an exact jsonb value match (Postgres jsonb equality is structural,
-- not textual, so key order and whitespace never matter here), and this file excludes exactly
-- that row with `r.basis is distinct from p_basis`. A GENUINELY different sibling's own basis
-- (its own lines, memo or amount) is a different jsonb value and is never excluded by this test.
--
-- THE ACCEPTED LIMITATION, STATED RATHER THAN HIDDEN: two INDEPENDENT plans whose bases are
-- byte-for-byte identical (same lines, same memo, same amount, same posting-date offset) would
-- hide each other from this advisory, because the self-exclusion test cannot tell them apart from
-- the inside. This is judged acceptable because (a) the advisory is ADVISORY, so a false negative
-- here costs a missed warning, never a wrong refusal or a lost row, and (b) two schedules an
-- accountant authored with byte-identical bases -- not merely overlapping accounts, the ordinary
-- and common case every other cell in this file proves is caught -- is a coincidence this estate
-- has never produced in practice. `tests/plan-overlap-sibling-arm.test.mjs`'s `p909.no-overlap`
-- cell proves the ORDINARY case (a fresh plan's own basis never warns about itself) is unaffected.
--
-- =====================================================================================
-- WHY "LIVE" MEANS `status in ('active','paused')`, NOT `status = 'active'` ALONE.
--
-- `clara.accounting_plans.status` is a closed three-member check (`active`,`paused`,`ended`,
-- 0193:423). A PAUSED plan's future admission is stopped, but the schedule itself still exists and
-- can resume (`clara.resume_accounting_plan`) -- a firm about to un-pause it benefits from knowing
-- it shares an account with what it is creating today, exactly as the 0045 template arm already
-- warns about a merely-live (never "currently running") template. An ENDED plan is terminal
-- (0193:495-497, `clara._tf_accounting_plans_immutable` refuses ever un-ending one) and can never
-- again post, so warning about it would be pure noise with no decision behind it. `tests/plan-
-- overlap-sibling-arm.test.mjs`'s `p909.status` cell drives both: an ended sibling stops warning,
-- a paused one keeps warning.
--
-- =====================================================================================
-- CONSUMER ORDER. None owed. The new arm only ever WIDENS an existing advisory's population
-- (a shape `_plan_overlap_warning` used to answer `null` for now answers a `plan_overlap`-kind
-- payload); nothing that used to be silent becomes a refusal, and the three plan-creating doors
-- and their web forms need no change to render it (the section above states why in full).
-- Rollback is a successor migration recutting the body back to this file's own pinned pre-image.
--
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE. `create or replace function` on the
-- SAME signature is naturally idempotent DDL -- §A below is unconditional either way. §0's
-- prestate recognises BOTH starting shapes (see its own comment): the measured pre-0281 pre-image
-- (a fresh apply) or this file's own prior output (a redo).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0  PRESTATE. Every body this file recuts, or calls without recutting, pinned by pre-image
--     sha256(prosrc) MEASURED off pg_proc on THIS migrated rig (268 migrations, 0001->0280,
--     clara_l05, 2026-09-20) now -- never transcribed from an older migration's own header.
-- =====================================================================================
do $w909_pre$
declare v_sha text; v_prosrc text; v_old boolean; v_own_sha text;
begin
  if to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)') is null then
    raise exception '#909 prestate: clara._plan_overlap_warning is absent -- 0193 must apply first'
      using errcode='CLR10';
  end if;

  -- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the measured PRE-0281
  -- pre-image (a fresh apply), or this file's OWN prior output, recognised by its own new arm's
  -- token together with the pre-existing arm's own token and the new tables it reaches. Anything
  -- else -- a body that matches neither -- is refused rather than guessed past.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if v_sha = 'f550d0b393f97f4124f14ecf9759bacfac9b002e4eea9bcce60ebacac829a074' then
    v_old := true;
  elsif position('accounting_plan_overlap' in v_prosrc) > 0
        and position('adjustment_template_overlap' in v_prosrc) > 0
        and position('clara.accounting_plan_revisions' in v_prosrc) > 0
        and position('is distinct from p_basis' in v_prosrc) > 0 then
    v_old := false;
  else
    raise exception '#909 prestate: clara._plan_overlap_warning is neither at its measured pre-0281 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode='CLR10';
  end if;
  v_own_sha := v_sha;   -- captured NOW: v_sha is reused for every pin below, and the closing
                         -- notice names clara._plan_overlap_warning's OWN sha, not the last one.

  -- NON-REGRESSION: the three callers, pinned so a later reader can see this file recuts none of
  -- them; each still reaches this function with the SAME two-argument call this file's unchanged
  -- signature keeps working.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#909 prestate: clara.create_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED and inherits the widened warning through _plan_overlap_warning alone', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#909 prestate: clara.revise_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)'::regprocedure;
  if v_sha is distinct from 'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8' then
    raise exception '#909 prestate: clara._accrual_plan_core has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED (the accrual OBO door''s own copy)', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#909 prestate: clean -- clara._plan_overlap_warning is at its % (%), and clara.create_accounting_plan / clara.revise_accounting_plan / clara._accrual_plan_core are all untouched at their own measured pre-images.',
    case when v_old then 'measured pre-0281 pre-image' else 'own prior output (a #957 redo)' end, v_own_sha;
end
$w909_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE RECUT. The existing 0045-template arm, verbatim, UNION ALL a new sibling-plan arm, both
--     merged into the ONE `templates` list. Unconditional: `create or replace function` on the
--     SAME signature converges to the same text whether this is a fresh apply or a #957 redo.
-- =====================================================================================
create or replace function clara._plan_overlap_warning(p_client uuid, p_basis jsonb) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case when count(*) = 0 then null else
    jsonb_build_object(
      'kind', case when bool_or(s.src = 'adjustment_template') then 'adjustment_template_overlap'
                   else 'accounting_plan_overlap' end,
      'templates', jsonb_agg(s.w order by s.w->>'name'))
  end
  from (
    -- ARM 1 (0193, UNCHANGED): every LIVE signed 0045 adjustment template of this client whose
    -- line account codes intersect this basis's.
    select 'adjustment_template'::text as src,
           jsonb_build_object('template_id', t.id, 'name', t.name, 'cadence', t.cadence,
             'accounts', (select jsonb_agg(distinct c) from unnest(x.codes) c)) as w
      from clara.adjustment_templates t
      cross join lateral (
        select array_agg(distinct l ->> 'account_code') as codes
          from jsonb_array_elements(case when jsonb_typeof(t.lines) = 'array' then t.lines else '[]'::jsonb end) l
         where (l ->> 'account_code') in (
           select b ->> 'account_code'
             from jsonb_array_elements(case when jsonb_typeof(p_basis->'lines') = 'array'
                                            then p_basis->'lines' else '[]'::jsonb end) b)
      ) x
     where t.client_id = p_client and t.status = 'live' and x.codes is not null

    union all

    -- ARM 2 (#909, NEW): every OTHER live (active or paused -- the header's own note) accounting
    -- plan of this client whose CURRENT (unsuperseded) revision's basis lines intersect this
    -- basis's. Self-exclusion by basis identity, not by id -- the header explains why in full.
    select 'accounting_plan'::text as src,
           jsonb_build_object('plan_id', p.id, 'name', p.purpose, 'cadence', r.frequency,
             'accounts', (select jsonb_agg(distinct c) from unnest(y.codes) c)) as w
      from clara.accounting_plans p
      join clara.accounting_plan_revisions r
        on r.plan_id = p.id and r.superseded_at is null
      cross join lateral (
        select array_agg(distinct l ->> 'account_code') as codes
          from jsonb_array_elements(case when jsonb_typeof(r.basis->'lines') = 'array'
                                         then r.basis->'lines' else '[]'::jsonb end) l
         where (l ->> 'account_code') in (
           select b ->> 'account_code'
             from jsonb_array_elements(case when jsonb_typeof(p_basis->'lines') = 'array'
                                            then p_basis->'lines' else '[]'::jsonb end) b)
      ) y
     where p.client_id = p_client and p.status in ('active','paused')
       and r.basis is distinct from p_basis
       and y.codes is not null
  ) s;
$$;
revoke all on function clara._plan_overlap_warning(uuid,jsonb) from public;

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim re-READ from the live catalog rather than believed.
-- =====================================================================================
do $w909_tail$
declare v_src text; v_sha text; v_acl text; v_owner text; v_secdef bool; v_vol text; v_cfg text;
begin
  -- (T.1) THE NEW ARM LANDED: the new kind, the tables it reaches, and the self-exclusion guard.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if position('accounting_plan_overlap' in v_src) = 0 then
    raise exception '#909 tail: the recut clara._plan_overlap_warning is missing the new accounting_plan_overlap kind' using errcode='CLR10';
  end if;
  if position('clara.accounting_plans' in v_src) = 0
     or position('clara.accounting_plan_revisions' in v_src) = 0 then
    raise exception '#909 tail: the recut clara._plan_overlap_warning does not scan clara.accounting_plans / clara.accounting_plan_revisions' using errcode='CLR10';
  end if;
  if position('is distinct from p_basis' in v_src) = 0 then
    raise exception '#909 tail: the recut clara._plan_overlap_warning lost the self-exclusion guard' using errcode='CLR10';
  end if;
  if position('''active'',''paused''' in v_src) = 0 then
    raise exception '#909 tail: the recut clara._plan_overlap_warning no longer restricts the sibling arm to active/paused plans' using errcode='CLR10';
  end if;

  -- (T.2) THE EXISTING ARM IS STILL THERE, BY NAME -- this file ADDS, it does not rewrite.
  if position('adjustment_template_overlap' in v_src) = 0
     or position('clara.adjustment_templates' in v_src) = 0 then
    raise exception '#909 tail: the recut clara._plan_overlap_warning lost the existing 0045 template arm' using errcode='CLR10';
  end if;

  -- (T.3) NON-REGRESSION: the three callers are BYTE-FOR-BYTE UNMOVED.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#909 tail: clara.create_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#909 tail: clara.revise_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)'::regprocedure;
  if v_sha is distinct from 'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8' then
    raise exception '#909 tail: clara._accrual_plan_core MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;

  -- (T.4) THE POSTURE CEREMONY. owner, SECURITY DEFINER, pinned search_path, STABLE, and the
  -- EXACT owner-only ACL -- unmoved by this recut.
  select pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), '<none>'), coalesce(p.proacl::text,'(null)')
    into v_owner, v_secdef, v_vol, v_cfg, v_acl
    from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#909 tail: clara._plan_overlap_warning owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_vol <> 's' then
    raise exception '#909 tail: clara._plan_overlap_warning is no longer STABLE (volatility=%)', v_vol
      using errcode='CLR10';
  end if;
  if v_cfg <> 'search_path=clara, pg_temp' then
    raise exception '#909 tail: clara._plan_overlap_warning''s search_path moved (%)', v_cfg using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#909 tail: clara._plan_overlap_warning gained a grant (acl=%) -- it must stay owner-only, reached only through create_accounting_plan/revise_accounting_plan/_accrual_plan_core', v_acl
      using errcode='CLR10';
  end if;

  raise notice '#909 tail: OK -- clara._plan_overlap_warning now carries a sibling-plan arm (scanning clara.accounting_plans/clara.accounting_plan_revisions for active-or-paused siblings, self-excluded by basis identity) merged into the SAME templates list the unchanged 0045 template arm already fills; clara.create_accounting_plan / clara.revise_accounting_plan / clara._accrual_plan_core are all byte-for-byte unmoved; and clara._plan_overlap_warning keeps its owner, SECURITY DEFINER flag, search_path, STABLE volatility and owner-only ACL.';
end
$w909_tail$;
