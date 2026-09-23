-- 0283_retire_plan_overlap_template_arm -- #929 (riders wave 3, lane 05), step 3 of 3 of the 0045
-- recurring-adjustment template lane's retirement (#788 owner ruling 2026-09-18: "retire the 0045
-- recurring-adjustment template lane fully"). #927 closed the three human-write doors; #928
-- retired the daily runtime sweep; this file retires the LAST live surface the 0045 lane still
-- reached through the plan lane -- `clara._plan_overlap_warning`'s template arm (0281, #909) --
-- so the advisory can only ever name an overlapping SIBLING accounting plan from here on. No
-- signature change, no new relation, no new door; `clara.adjustment_templates` itself and every
-- READ of it (D6's retained historical surface) are untouched -- this file only stops
-- `_plan_overlap_warning` from SCANNING that table.
-- =====================================================================================
-- Spec of record: issue #929, Agent Brief (triage correction comment, the newest and only live
-- Agent Brief on the ticket -- it drops the PRD half of the body's own AC1, since docs/PRD.md
-- never mentioned "template"/模板 at all, and confirms #788's closing half and #909's own
-- 2026-09-18 comment already satisfy the body's AC3). The remaining scope this file owns:
-- "`_plan_overlap_warning`'s template arm is retired in a new migration (prestate pin); the plan
-- forms render only the sibling-plan advisory (#909's arm); plan-form cells updated" and "the
-- migration applies on a from-scratch chain; the plans walk stays green." CONTEXT.md's two
-- "avoid" lines and the ARCHITECTURE.md:500 blueprint-drift line are this ticket's OTHER half,
-- carried in the docs commit and the closing report, not in this file.
--
-- =====================================================================================
-- WHY THIS IS SAFE TO DO UNCONDITIONALLY, WITH NO DATA GUARD. Unlike 0282 (which had to refuse a
-- non-retired template because it was CLOSING THE ONLY DOORS that could ever advance one), this
-- file removes a READ, not a write path -- no row anywhere becomes orphaned or unreachable by
-- this change. `clara.adjustment_templates` keeps every row it has (live, proposed or retired);
-- `clara.list_adjustment_templates` and Registers -> Adjustments (#927) still show them in full;
-- only the PLAN-CREATION advisory stops consulting the table. A `live` template row after this
-- file (the hosted census #909's own header records found zero, but this rig's own dev fixtures
-- carry many -- see the from-scratch note below) simply stops being named by
-- `_plan_overlap_warning`; it is neither read nor written by this migration.
--
-- =====================================================================================
-- WHY THIS IS ONE `UNION ALL` ARM DELETED, NOT A NEW FUNCTION. `_plan_overlap_warning` (p_client
-- uuid, p_basis jsonb)`, recut once already by 0281 (#909) to add the sibling-plan arm alongside
-- the original 0193 template arm, is recut a second time here to DROP the template arm entirely:
-- the `union all` and its whole first branch (the `adjustment_templates`/lateral-codes subquery)
-- are removed; the surviving branch is 0281's own ARM 2, VERBATIM, unindented back to the top
-- level; `kind` collapses from a `case` (it only ever had two branches, and the first is now
-- unreachable) to the literal `'accounting_plan_overlap'`, since that is now the ONLY value this
-- function can ever answer. The three plan-creating doors and their web forms
-- (`apps/web/components/{plans,accruals,prepayments}-form.tsx`) read only
-- `overlap_warning.templates.map((x) => x.name)` and never branch on `kind` (0281's own header
-- states this in full; unchanged here), so none of them needs a line touched -- the Agent Brief's
-- own "plan-form cells updated" is satisfied by the MOCK LITERALS in
-- `prepayments-keyboard.test.tsx`/`accrual-form.test.tsx` and the `PlanOverlapWarning`-shaped
-- TypeScript types in `lib/{plans,accruals,prepayments}/api.ts` (all edited in this ticket's web
-- commit, not this file) no longer describing a `template_id`/`adjustment_template_overlap` shape
-- the backend can never answer again.
--
-- =====================================================================================
-- CONSUMER ORDER. None owed, same reasoning as 0281's own header: the new (narrower) answer set
-- is a strict SUBSET of the old one -- a caller that used to see a `templates` array containing
-- BOTH a template entry and a sibling-plan entry (0281's own documented "combined" case) now sees
-- only the sibling-plan entry; a caller that used to see ONLY a template entry (no sibling plan)
-- now sees `null`. Neither shape is new to the forms: `null` and a `templates` array of
-- `{name,cadence,accounts}` items are both already-handled shapes, `overlap_warning !== null` is
-- the only branch any door or form takes, and `kind` was never read outside the three now-trimmed
-- db test files this ticket also edits. Nothing that used to warn a HUMAN in the UI stops warning
-- because of a sibling plan; only the RETIRED lane's own contribution to the warning disappears,
-- which is this whole ticket's point.
--
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE. `create or replace function` on the
-- SAME signature is naturally idempotent DDL -- SS A below is unconditional either way. SS0's
-- prestate recognises BOTH starting shapes (see its own comment): the measured pre-0283 pre-image
-- (a fresh apply, 0281's own two-arm body) or this file's own prior output (a redo).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- SS0  PRESTATE. `clara._plan_overlap_warning`'s pre-image, pinned by sha256(prosrc) MEASURED off
--      pg_proc on THIS migrated rig (282 migrations, 0001->0282, clara_l05, 2026-09-23) now --
--      never transcribed from an older migration's own header. The three plan-creating callers
--      0281 already pinned as non-regression are re-pinned here, unconditionally: this file does
--      not touch them, and a mover would mean a DIFFERENT ticket silently changed the door this
--      advisory is reached through underneath this one.
-- =====================================================================================
do $w929_pre$
declare v_sha text; v_prosrc text; v_old boolean;
begin
  if to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)') is null then
    raise exception '#929 prestate: clara._plan_overlap_warning is absent -- 0193 and 0281 must apply first'
      using errcode='CLR10';
  end if;

  -- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the measured PRE-0283
  -- pre-image (0281's own fresh two-arm output, a fresh apply of this file), or this file's OWN
  -- prior output (a #957 redo), recognised by the template arm's ABSENCE together with the
  -- sibling arm's own tokens. Anything else is refused rather than guessed past.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if v_sha = '33b23167bf67f911a13b7523a4eb109e406ec2a10367b444c687d2461abc1e0b' then
    v_old := true;
  elsif position('accounting_plan_overlap' in v_prosrc) > 0
        and position('adjustment_template_overlap' in v_prosrc) = 0
        and position('clara.adjustment_templates' in v_prosrc) = 0
        and position('clara.accounting_plan_revisions' in v_prosrc) > 0
        and position('is distinct from p_basis' in v_prosrc) > 0 then
    v_old := false;
  else
    raise exception '#929 prestate: clara._plan_overlap_warning is neither at its measured pre-0283 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#929 prestate: clara.create_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED and inherits the trimmed warning through _plan_overlap_warning alone', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#929 prestate: clara.revise_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)'::regprocedure;
  if v_sha is distinct from 'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8' then
    raise exception '#929 prestate: clara._accrual_plan_core has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED (the accrual OBO door''s own copy)', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#929 prestate: clean -- clara._plan_overlap_warning is at its % , and clara.create_accounting_plan / clara.revise_accounting_plan / clara._accrual_plan_core are all untouched at their own measured pre-images.',
    case when v_old then 'measured pre-0283 pre-image (0281''s own two-arm output)' else 'own prior output (a #957 redo)' end;
end
$w929_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A  THE RECUT. 0281's ARM 2 (the sibling-plan scan), verbatim and unindented; 0281's ARM 1
--       (the 0045 template scan) is gone. `kind` is now the one literal value this function can
--       ever answer. Unconditional: `create or replace function` on the SAME signature converges
--       to the same text whether this is a fresh apply or a #957 redo.
-- =====================================================================================
create or replace function clara._plan_overlap_warning(p_client uuid, p_basis jsonb) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case when count(*) = 0 then null else
    jsonb_build_object(
      'kind', 'accounting_plan_overlap',
      'templates', jsonb_agg(s.w order by s.w->>'name'))
  end
  from (
    -- 0281's ARM 2, unmoved: every OTHER live (active or paused) accounting plan of this client
    -- whose CURRENT (unsuperseded) revision's basis lines intersect this basis's. Self-exclusion
    -- by basis identity -- 0281's own header explains why in full, unchanged by this file.
    select jsonb_build_object('plan_id', p.id, 'name', p.purpose, 'cadence', r.frequency,
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
-- SS T  TAIL. Every claim re-READ from the live catalog rather than believed.
-- =====================================================================================
do $w929_tail$
declare v_src text; v_sha text; v_acl text; v_owner text; v_secdef bool; v_vol text; v_cfg text;
begin
  -- (T.1) THE TEMPLATE ARM IS GONE -- by name, not merely by behaviour.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if position('adjustment_template_overlap' in v_src) > 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning still carries the retired adjustment_template_overlap kind' using errcode='CLR10';
  end if;
  if position('clara.adjustment_templates' in v_src) > 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning still scans clara.adjustment_templates' using errcode='CLR10';
  end if;

  -- (T.2) THE SIBLING ARM SURVIVES, VERBATIM -- 0281's own tokens, unmoved by this file.
  if position('accounting_plan_overlap' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning lost the accounting_plan_overlap kind' using errcode='CLR10';
  end if;
  if position('clara.accounting_plans' in v_src) = 0
     or position('clara.accounting_plan_revisions' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning no longer scans clara.accounting_plans / clara.accounting_plan_revisions' using errcode='CLR10';
  end if;
  if position('is distinct from p_basis' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning lost the self-exclusion guard' using errcode='CLR10';
  end if;
  if position('''active'',''paused''' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning no longer restricts the sibling arm to active/paused plans' using errcode='CLR10';
  end if;

  -- (T.3) NON-REGRESSION: the three callers are BYTE-FOR-BYTE UNMOVED.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#929 tail: clara.create_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#929 tail: clara.revise_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)'::regprocedure;
  if v_sha is distinct from 'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8' then
    raise exception '#929 tail: clara._accrual_plan_core MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;

  -- (T.4) THE POSTURE CEREMONY. owner, SECURITY DEFINER, pinned search_path, STABLE, and the
  -- EXACT owner-only ACL -- unmoved by this recut.
  select pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), '<none>'), coalesce(p.proacl::text,'(null)')
    into v_owner, v_secdef, v_vol, v_cfg, v_acl
    from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb)'::regprocedure;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#929 tail: clara._plan_overlap_warning owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_vol <> 's' then
    raise exception '#929 tail: clara._plan_overlap_warning is no longer STABLE (volatility=%)', v_vol
      using errcode='CLR10';
  end if;
  if v_cfg <> 'search_path=clara, pg_temp' then
    raise exception '#929 tail: clara._plan_overlap_warning''s search_path moved (%)', v_cfg using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#929 tail: clara._plan_overlap_warning gained a grant (acl=%) -- it must stay owner-only, reached only through create_accounting_plan/revise_accounting_plan/_accrual_plan_core', v_acl
      using errcode='CLR10';
  end if;

  raise notice '#929 tail: OK -- clara._plan_overlap_warning''s 0045 template arm is retired (adjustment_template_overlap and clara.adjustment_templates both absent from prosrc); the sibling-plan arm (#909) is the ONLY arm left, unmoved; clara.create_accounting_plan / clara.revise_accounting_plan / clara._accrual_plan_core are all byte-for-byte unmoved; and clara._plan_overlap_warning keeps its owner, SECURITY DEFINER flag, search_path, STABLE volatility and owner-only ACL.';
end
$w929_tail$;
