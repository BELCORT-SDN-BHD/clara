-- 0283_retire_plan_overlap_template_arm -- #929 (riders wave 3, lane 05), step 3 of 3 of the 0045
-- recurring-adjustment template lane's retirement (#788 owner ruling 2026-09-18: "retire the 0045
-- recurring-adjustment template lane fully"). #927 closed the three human-write doors; #928
-- retired the daily runtime sweep; this file retires the LAST live surface the 0045 lane still
-- reached through the plan lane -- `clara._plan_overlap_warning`'s template arm (0281, #909) --
-- so the advisory can only ever name an overlapping SIBLING accounting plan from here on.
-- `clara.adjustment_templates` itself and every READ of it (D6's retained historical surface) are
-- untouched: this file only stops `_plan_overlap_warning` from SCANNING that table.
--
-- =====================================================================================
-- WHAT THE FIX ROUND ADDED TO THIS FILE (2026-09-23, second round), AND WHY IT IS HERE RATHER
-- THAN IN A NEW MIGRATION. The review rounds found TWO defects in the arm that SURVIVES the
-- retirement -- not in the retirement itself: the sibling arm's self-exclusion hid the
-- total-overlap case (ADV-L05-03 / L05-SPEC-09), and the advisory answered null for two
-- CONCURRENT creations (ADV-L05-04). Round one recorded both as "a ticket of their own, because
-- the honest fix recuts three caller bodies that four migrations pin byte-unchanged". That reason
-- is WITHDRAWN: 0280-0283 are this lane's own unmerged migrations and 0283 is the highest applied
-- version, so the three callers can be recut HERE, under #957's redo mode, and the pins in
-- 0280/0281/0282 -- which run BEFORE this file in every chain -- still see the pre-images they
-- name. Wave 3 reserved 0280-0283 for this lane and 0284 onward belongs to another lane, so a
-- fourth file was never an option; this one grows instead, and its NAME is now narrower than its
-- content. Both fixes touch ONLY the surviving sibling arm and its three callers; the retirement
-- itself is unchanged.
--
-- =====================================================================================
-- Spec of record: issue #929, Agent Brief (triage correction comment, the newest and only live
-- Agent Brief on the ticket -- it drops the PRD half of the body's own AC1, since docs/PRD.md
-- never mentioned "template" at all, and confirms #788's closing half and #909's own 2026-09-18
-- comment already satisfy the body's AC3). The remaining scope this file owns:
-- "`_plan_overlap_warning`'s template arm is retired in a new migration (prestate pin); the plan
-- forms render only the sibling-plan advisory (#909's arm); plan-form cells updated" and "the
-- migration applies on a from-scratch chain; the plans walk stays green." CONTEXT.md's two
-- "avoid" lines and the ARCHITECTURE.md:500 blueprint-drift line are this ticket's OTHER half,
-- carried in the docs commit and the closing report, not in this file.
--
-- =====================================================================================
-- WHY THE RETIREMENT IS SAFE TO DO UNCONDITIONALLY, WITH NO DATA GUARD. Unlike 0282 (which had to
-- refuse a non-retired template because it was CLOSING THE ONLY DOORS that could ever advance
-- one), this file removes a READ, not a write path -- no row anywhere becomes orphaned or
-- unreachable by this change. `clara.adjustment_templates` keeps every row it has (live, proposed
-- or retired); `clara.list_adjustment_templates` and Registers -> Adjustments (#927) still show
-- them in full; only the PLAN-CREATION advisory stops consulting the table. A `live` template row
-- after this file (the hosted census #909's own header records found zero, but this rig's own dev
-- fixtures carry many) simply stops being named by `_plan_overlap_warning`; it is neither read nor
-- written by this migration.
--
-- =====================================================================================
-- THE SIGNATURE CHANGES, AND THE OLD ONE IS DROPPED. `_plan_overlap_warning(p_client uuid,
-- p_basis jsonb)` -- 0193's original, recut by 0281 (#909) to add the sibling arm -- becomes
-- `_plan_overlap_warning(p_client uuid, p_basis jsonb, p_self_plan uuid)`, and the two-argument
-- body is DROPPED rather than left standing: a surviving two-argument overload would keep FIX 1's
-- blind spot reachable by anyone who called it. The function is owner-only (its ACL is
-- `{clara_fn_owner=X/clara_fn_owner}`, asserted in the tail) and is reached ONLY through
-- `clara.create_accounting_plan`, `clara.revise_accounting_plan` and `clara._accrual_plan_core`,
-- all three of which this file recuts in the same transaction, so nothing else can be holding the
-- old signature. The migrations that reference `(uuid,jsonb)` -- 0193, 0222's own prestate at
-- :248, 0223, 0250, 0281, 0282 -- all run BEFORE this one in every chain and see it.
--
-- =====================================================================================
-- WHAT THE ARM ITSELF BECOMES. The `union all` and its whole first branch (the
-- `adjustment_templates`/lateral-codes subquery) are removed; the surviving branch is 0281's own
-- ARM 2, unindented back to the top level, with ONE predicate replaced (FIX 1 below); `kind`
-- collapses from a `case` (it only ever had two branches, and the first is now unreachable) to the
-- literal `'accounting_plan_overlap'`, since that is now the ONLY value this function can ever
-- answer. The three plan-creating doors and their web forms
-- (`apps/web/components/{plans,accruals,prepayments}-form.tsx`) read only
-- `overlap_warning.templates.map((x) => x.name)` and never branch on `kind` (0281's own header
-- states this in full; unchanged here), so no FORM needs a line touched -- the Agent Brief's own
-- "plan-form cells updated" is satisfied by the MOCK LITERALS in
-- `prepayments-keyboard.test.tsx`/`accrual-form.test.tsx` and the `PlanOverlapWarning`-shaped
-- TypeScript types in `lib/{plans,accruals,prepayments}/api.ts` (all edited in this ticket's web
-- commit, not this file) no longer describing a `template_id`/`adjustment_template_overlap` shape
-- the backend can never answer again.
--
-- =====================================================================================
-- FIX 1 -- SELF-EXCLUSION BY IDENTITY (ADV-L05-03 / L05-SPEC-09). All three callers compute this
-- advisory AFTER inserting their own plan row (create/accrual) or their own new live revision
-- (revise), so the function has always had to exclude the caller's own plan. 0281 excluded it BY
-- BASIS VALUE (`r.basis is distinct from p_basis`) because the function took no plan id and
-- #909's brief forbade widening the three doors, and justified the resulting blind spot by
-- calling two live plans with byte-identical bases "a coincidence this estate has never produced
-- in practice".
--
-- THAT SENTENCE IS FALSE on the rig this lane is built on, and the fix round withdrew it:
-- measured on clara_l05, 7 (client, basis_digest) groups held 28 live plans with byte-identical
-- bases -- four at a time, minted 4 ms apart by the rig's own seed ("Monthly office rent
-- accrual") -- and `_plan_overlap_warning(<one of those clients>, <one of their own bases>)`
-- answered NULL. The TOTAL-overlap case, the one a human most needs told, was exactly the case the
-- self-exclusion swallowed.
--
-- The fix is the one 0281 named and could not take: pass the plan id the three doors already hold
-- and exclude by `p.id is distinct from p_self_plan`. The by-value predicate is GONE, so a sibling
-- carrying a byte-identical basis is now named. NOT a by-value heuristic instead: excluding "the
-- most recently written identical-basis plan" would make `revise_accounting_plan` warn a firm
-- about the very plan it is revising, and a warning that names your own row is worse than a
-- missing one -- it teaches the reader to skip the key. `p_self_plan` null excludes nothing, which
-- is the right degenerate answer for a caller that has no plan of its own; no caller passes null.
--
-- =====================================================================================
-- FIX 2 -- THE CONCURRENCY WINDOW (ADV-L05-04). The advisory is computed INSIDE the creating
-- transaction, so two sessions creating overlapping plans at the same time each read the other's
-- row as uncommitted and BOTH answered null; the second saw the first only after it committed, by
-- which time its own receipt had been returned. #909 was filed over a warning that "may not fire
-- depending on creation order"; 0281 fixed the sequential case and left the concurrent one.
--
-- Closed here by the client-level advisory rung this estate already uses for this class of
-- question: `pg_advisory_xact_lock(203005004, hashtext(<client>::text))`, the same rung
-- `clara.retire_adjustment_template` takes, in all three plan-creating doors. Under it the second
-- session waits for the first to commit and then sees its row, so the advisory answers
-- concurrently what it answers in sequence.
--
-- WHY THAT RUNG, TAKEN THERE, ADDS NO CYCLE -- censused on the live catalog, not argued: 51 bodies
-- take 203005004, and NOT ONE of them reads or locks `clara.accounting_plans` (a
-- `prosrc like '%pg_advisory_xact_lock(203005004%' and prosrc like '%accounting_plans%'` census
-- answered zero rows; the single body that names an accounting-plan door at all,
-- `clara.sign_depreciation_authority`, does so in a comment). So the only new ordered pair is
-- "client rung -> clara.accounting_plans row", and no body anywhere holds a plan row while waiting
-- for that rung. The rung is taken AFTER the op-receipt reservation, which is 0037 SECTION K's own
-- documented order (op-receipt -> advisory rung), and ABOVE the plan row lock in
-- `revise_accounting_plan`, which is the order 0238 established for the client rung generally
-- ("the rung before the guard reads"). `clara.create_prepayment_schedule` already called
-- `create_accounting_plan` and only afterwards locked the plan row it had just made, so it
-- inherits the same order. Advisory transaction locks are re-entrant, so the outer accrual and
-- prepayment doors re-entering through these three cost nothing.
--
-- WHAT FIX 2 DOES NOT CLAIM. The rung serialises the three PLAN-CREATING doors against each other
-- per client. A plan created while some OTHER writer of this estate runs is unaffected, and the
-- advisory remains exactly that -- advisory. Nothing here refuses a plan.
--
-- =====================================================================================
-- WHAT THE THREE-STEP RETIREMENT DOES NOT CLOSE, MEASURED (fix round, 2026-09-23, clara_l05 at
-- 0283). #927 closed the three human write doors, #928 deleted the daily sweep, this file takes
-- the advisory's template arm. NONE of the three touches `clara._propose_adjustment_template_
-- core`, and one path still reaches it: `clara.wake_establish_prepayment_schedule` (0140's agent
-- prepayment limb, granted to clara_wake_interactive and carried in `clara.wake_fn_allowlist` as
-- (close_prep, wake_establish_prepayment_schedule)) -> `clara._agent_prepayment_schedule_core` ->
-- that core. DRIVEN, not read off the source: calling the core inside a transaction that was
-- rolled back answered {"status":"proposed","template_id":...} and left one row at status
-- 'proposed' before the rollback. Such a row can never be signed (#927), never be run by hand
-- (#927), never be swept (#928) and is never named by this advisory (this file) -- the orphan
-- 0282's own live-template guard exists to prevent.
--
-- WHAT HOLDS IT SHUT, AND WHAT DOES NOT. `clara.wake_engine_sources.close_prep.enabled` is FALSE
-- (measured; it has been since 0133, and 0138/0140/0159/0223 each pin it as a prestate or tail
-- tripwire). Be exact about where that flag bites, because it is NOT a wall in this database:
-- `clara.mint_wake_credential_for_task` is granted to clara_runtime and never reads the flag,
-- which is why clara_l05 carries 771 close_prep credentials its own batteries minted. The gate is
-- the runtime's claim step, both halves of it -- `packages/runtime/lib/wake-engine.mjs:392-397`
-- (wake_outbox, held -> running) and `:801-804` (direct_queue, queued -> running) promote a task
-- only `... and exists (select 1 from clara.wake_engine_sources where source_key=$2 and enabled)`,
-- under the same `wake_source_gate:<key>` advisory lock `clara.set_wake_source_enabled` takes. So
-- while the flag is false no close_prep workflow ever RUNS and the wrapper is never called in
-- production. The second thing holding it shut is the allowlist's shape: that function appears
-- there under close_prep and under NO OTHER wake kind (measured), and every other kind IS live --
-- `interactive_client` is minted from a chat turn by `clara.mint_chat_close_credential` and
-- `clara.wake_engine_sources` holds no row for it at all, so the flag above could never speak for
-- it. Both facts are a parked feature flag and a one-row table, not a closed door. Retiring or
-- rerouting the limb -- at `clara.create_prepayment_schedule`, 0223's plan-lane successor --
-- would retire an agent-lane PRODUCT capability, which the #788 split did not publish and no
-- ticket of this lane owns, so it is deliberately NOT done here, in EITHER fix round. Unlike
-- FIX 1 and FIX 2, this is not a wrong answer in code this lane wrote; it is a capability nobody
-- has ruled on, and the ruling is owed before the code is. What IS done: the containment is a live
-- cell rather than a sentence -- `tests/plan-overlap-template-arm-retired.test.mjs`'s
-- `p929.containment` asserts the core is ungranted, the wrapper is still wired, the allowlist
-- names it for close_prep AND FOR NO OTHER KIND, and the source is parked; two rolled-back mutants
-- (flip the flag, widen the allowlist) prove both readers can say NO; and it goes RED with the
-- remedy in its own message the day anyone unparks close_prep or widens that allowlist.
--
-- =====================================================================================
-- A CITATION 0280 CARRIES THAT RESOLVES TO NOTHING (fix round, 2026-09-23; AGENTS.md rule 6).
-- 0280_plan_schedule_yield_wall.sql names `clara.revise_accrual_adjustment` three times -- its
-- header twice and, at :265, inside the `clara._assert_plan_schedule` body it ships, so the string
-- is now permanent prosrc. No such function exists: the catalog's `clara` functions matching
-- '%accrual%' are create_accrual_adjustment, create_accrual_adjustment_for, get_accrual_adjustment
-- and list_accrual_adjustments plus the private helpers. The two REAL callers of
-- `clara._assert_accrual_schedule_yields` are `clara.create_accrual_adjustment` (granted
-- clara_authenticated) and `clara.create_accrual_adjustment_for` (granted clara_runtime, the
-- on-behalf-of door) -- so the accrual entrance's yield wall guards the runtime door too, which
-- 0280's header does not say. 0280 is applied and immutable (and is not the highest applied
-- version, so #957's redo cannot reach it); the correction is recorded here, in packages/db's
-- README and in the lane's fix report rather than left as an anchor a later reader will chase.
--
-- =====================================================================================
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE, and the two starting shapes are told
-- apart BY SIGNATURE rather than by a marker inside a body (the wave-3 addendum's "a
-- marker-tolerant or bimodal pin hides its sha branch from a redo"): a FRESH APPLY finds the
-- two-argument `_plan_overlap_warning` and no three-argument one, and every pin on that branch is
-- a hard sha; a REDO finds the three-argument one and no two-argument one, and every pin on THAT
-- branch is a hard sha too. Neither branch tolerates a marker. Anything else is refused rather
-- than guessed past. Every statement below is `create or replace function` or
-- `drop function if exists`, so the two branches converge on the same catalog.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- SS0  PRESTATE. Four bodies, pinned by sha256(prosrc) MEASURED off pg_proc on this migrated rig
--      -- never transcribed from an older migration's own header. `_plan_overlap_warning` is the
--      one this file rewrites wholesale; the three callers are recut too (FIX 1 and FIX 2), so
--      they are pinned at their PRE-IMAGES on the fresh-apply branch and at this file's own
--      OUTPUT on the redo branch. Which branch we are on is decided by SIGNATURE, above any body
--      comparison, so neither branch has to tolerate a marker.
-- =====================================================================================
do $w929_pre$
declare
  v_sha text; v_old boolean; v_branch text;
  v_two oid := to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)');
  v_three oid := to_regprocedure('clara._plan_overlap_warning(uuid,jsonb,uuid)');
  -- (signature, fresh-apply pre-image sha, this file's own output sha)
  v_pins text[] := array[
    'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)',
    '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4', '99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424',
    'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
    '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f', '8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886',
    'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
    'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8', '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5'];
  v_want text; i int;
begin
  -- WHICH STARTING SHAPE. Exactly two are admissible, and they differ in ARITY, which is a fact
  -- about the catalog rather than about a string inside a body.
  if v_two is not null and v_three is null then
    v_old := true;    -- FRESH APPLY: 0281's two-argument output is live, this file has not run
  elsif v_two is null and v_three is not null then
    v_old := false;   -- REDO (#957): this file's own three-argument output is live
  elsif v_two is null and v_three is null then
    raise exception '#929 prestate: clara._plan_overlap_warning is absent at BOTH signatures -- 0193 and 0281 must apply first'
      using errcode='CLR10';
  else
    raise exception '#929 prestate: clara._plan_overlap_warning resolves at BOTH (uuid,jsonb) and (uuid,jsonb,uuid) -- a half-applied 0283, or a third party added an overload; refusing rather than guessing which one the callers reach'
      using errcode='CLR10';
  end if;
  v_branch := case when v_old then 'fresh apply' else 'redo (#957)' end;

  -- THE ADVISORY ITSELF, hard-pinned on either branch.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = coalesce(v_two, v_three);
  v_want := case when v_old
                 then '33b23167bf67f911a13b7523a4eb109e406ec2a10367b444c687d2461abc1e0b'  -- 0281's own two-arm output
                 else 'c2566349405844d14c94ba57836ee9256878001f744ad627b0337ae5b8caf7dc' end;                                                  -- this file's own output
  if v_sha is distinct from v_want then
    raise exception '#929 prestate: clara._plan_overlap_warning is at sha % but this % expects % -- refusing rather than recutting a body nobody has read',
      v_sha, v_branch, v_want
      using errcode='CLR10';
  end if;

  -- THE THREE CALLERS this file recuts (FIX 1 and FIX 2). On a fresh apply they must be at the
  -- pre-images 0280/0281/0282 all pin; on a redo they must be at this file's own output. A mover
  -- means a DIFFERENT ticket changed a door underneath this one, which is exactly the thing a
  -- prestate exists to stop.
  i := 1;
  while i <= array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[i]) is null then
      raise exception '#929 prestate: % does not resolve -- 0193/0222/0250 must apply first', v_pins[i]
        using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
     where p.oid = to_regprocedure(v_pins[i]);
    v_want := case when v_old then v_pins[i+1] else v_pins[i+2] end;
    if v_sha is distinct from v_want then
      raise exception '#929 prestate: % is at sha % but this % expects % -- this file RECUTS all three callers and refuses to overwrite a body it has not read',
        v_pins[i], v_sha, v_branch, v_want
        using errcode='CLR10';
    end if;
    i := i + 3;
  end loop;

  raise notice '#929 prestate: clean -- % ; clara._plan_overlap_warning and its three callers are all at the bodies this branch expects.',
    case when v_old then 'FRESH APPLY (0281''s two-argument output is live)' else 'REDO (#957; this file''s own three-argument output is live)' end;
end
$w929_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A  THE ADVISORY, RECUT AND WIDENED. 0281's ARM 2 (the sibling-plan scan), unindented, with
--       the by-value self-exclusion replaced by the caller's own plan id (FIX 1); 0281's ARM 1
--       (the 0045 template scan) is gone. `kind` is now the one literal value this function can
--       ever answer. `create or replace function` on the three-argument signature converges to the
--       same text whether this is a fresh apply or a #957 redo.
-- =====================================================================================
create or replace function clara._plan_overlap_warning(p_client uuid, p_basis jsonb, p_self_plan uuid)
  returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case when count(*) = 0 then null else
    jsonb_build_object(
      'kind', 'accounting_plan_overlap',
      'templates', jsonb_agg(s.w order by s.w->>'name'))
  end
  from (
    -- 0281's ARM 2: every OTHER live (active or paused) accounting plan of this client whose
    -- CURRENT (unsuperseded) revision's basis lines intersect this basis's. "OTHER" is now the
    -- caller's own plan id (FIX 1), not the basis value it happens to carry -- so two plans with
    -- byte-identical bases, the TOTAL overlap, warn about each other instead of hiding.
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
       and p.id is distinct from p_self_plan
       and y.codes is not null
  ) s;
$$;
revoke all on function clara._plan_overlap_warning(uuid,jsonb,uuid) from public;

-- =====================================================================================
-- SS B  THE THREE CALLERS. Reproduced from their pinned pre-images with exactly two edits each:
--       the client rung (FIX 2) and the plan id passed to the advisory (FIX 1). Nothing else in
--       any of the three bodies moves -- the tail below re-reads every other invariant they carry
--       (their ACLs, their own lock order, and `revise_accounting_plan`'s "the ended test is
--       re-made under the plan row lock" shape, which `p640.revision.end_race` also censuses).
-- =====================================================================================
create or replace function clara.create_accounting_plan(
    p_client uuid, p_kind text, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $p929plan$

declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_plan uuid; v_rev uuid; v_digest text; v_auto boolean;
  v_ref_kind text; v_ref_id uuid; v_reason text; v_warning jsonb; v_next jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting plan' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- THE EXCLUDED ADAPTERS, REFUSED BY NAME (the header's scope note).
  -- #653 widens this list by ONE member. Depreciation and close schedules STILL answer
  -- `plan_kind_unsupported` BY NAME, so a later file can widen it again additively and every
  -- caller that tried one in the meantime got a typed answer rather than a silent success.
  if p_kind is null or p_kind not in ('recurring_journal','reversing_journal','amortisation_schedule') then
    raise exception 'plan kind % is not supported in this slice (recurring_journal, reversing_journal, amortisation_schedule)', coalesce(p_kind,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind,
          'supported', jsonb_build_array('recurring_journal','reversing_journal','amortisation_schedule'))::text;
  end if;
  -- THE AUTHORITY SHAPE.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- #977 (0250): RESOLVED, not merely well-shaped -- and, on the CHAT-LANE arm, a PERSON'S
  -- INSTRUCTION rather than a task the estate enqueued for itself. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority
  -- (#640's own criterion); an agent run HAS one, and #977 is the ruling that stops it counting.
  -- clara._authority_ref_refusal is the ONE definition this door and
  -- clara.sign_depreciation_authority both read; this door keeps its OWN error class (CLR10).
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p_kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'create_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'kind', p_kind, 'purpose', p_purpose,
      'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone,
      'effective_from', p_effective_from, 'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this plan key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  -- PLACED by 0037 SECTION K's own order (op-receipt -> advisory rung) and above every
  -- clara.accounting_plans row lock in this body. Censused on the live catalog before it was
  -- added: of the fifty-one bodies that take 203005004, not one reads or locks
  -- clara.accounting_plans, so the only new pair is "rung -> plan row" and no body anywhere holds
  -- a plan row while waiting for this rung. Advisory xact locks are re-entrant, so the outer
  -- accrual and prepayment doors re-taking it through this one cost nothing.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, v_firm, p_client, p_kind, 'active', btrim(p_purpose), p_authority_kind,
      p_authority_ref, v_actor, p_effective_from, 1, v_actor);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, v_firm, p_client, p_kind, 1, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;

  -- #929 (fix round, ADV-L05-03): SELF-EXCLUSION BY IDENTITY. The advisory used to exclude
  -- the row this door just inserted by comparing BASIS VALUES, which also hid every OTHER
  -- plan carrying the same basis -- total overlap, the case a human most needs told. It now
  -- takes the plan id this door already holds.
  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, v_auto,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(v_firm, v_actor, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind, 'revision', 1,
      'authority', p_authority_ref, 'op_key', p_op_key));

  v_result := jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind, 'next_occurrences', coalesce(v_next, '[]'::jsonb),
    'overlap_warning', v_warning);
  return clara._finish_op(v_firm, 'create_accounting_plan', p_op_key, v_result);
end $p929plan$;

create or replace function clara.revise_accounting_plan(p_plan uuid, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $p929rev$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; cur record;
  v_dedupe jsonb; v_digest text; v_auto boolean; v_rev uuid; v_next int; v_result jsonb;
  v_covered date; v_first date; v_earliest date;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'revising an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  perform clara._assert_plan_schedule(p.kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  -- THE AUTHORITY FLOOR (review finding B3). A revision changes the SCHEDULE; it cannot move the
  -- day a human authorised this plan from. Without this, a plan created with today's authority
  -- could be revised to 2020 and then "catch up" a decade of back-dated Work — the catch-up wall
  -- reads the live revision, and the live revision was whatever the last caller said.
  if p_effective_from < p.authority_from then
    raise exception 'this plan was authorised from %; a revision cannot start earlier',
      to_char(p.authority_from,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','effective_from_before_authority',
          'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
          'requested_from', to_char(p_effective_from,'YYYY-MM-DD'))::text;
  end if;
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p.kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'revise_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone, 'effective_from', p_effective_from,
      'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this revision key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  -- PLACED by 0037 SECTION K's own order (op-receipt -> advisory rung) and above every
  -- clara.accounting_plans row lock in this body. Censused on the live catalog before it was
  -- added: of the fifty-one bodies that take 203005004, not one reads or locks
  -- clara.accounting_plans, so the only new pair is "rung -> plan row" and no body anywhere holds
  -- a plan row while waiting for this rung. Advisory xact locks are re-entrant, so the outer
  -- accrual and prepayment doors re-taking it through this one cost nothing.
  perform pg_advisory_xact_lock(203005004, hashtext(p.client_id::text));

  -- RUNG 1, so a revision and a scan cannot interleave: the scan reads the live revision under
  -- this same lock and therefore sees exactly one of the two states.
  perform 1 from clara.accounting_plans where id = p_plan for update;
  -- …AND THE STATUS IS RE-READ UNDER IT (review finding S4). The test above was made on an
  -- UNLOCKED read, so an `end_accounting_plan` committing in the window between the two could hand
  -- an ended plan a fresh live revision. pause/resume/end all re-read under this lock; so does this.
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  select * into cur from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to supersede' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;
  -- THE ALIGNMENT WALL (review finding SHOULD-1). A frequency change RE-ALIGNS every period key,
  -- and `unique (plan_id, leg, period_key)` is exact per alignment and blind across alignments: a
  -- monthly September (`2026-09-01`) and a quarterly August-to-October (`2026-08-01`) are two
  -- different keys naming one September, so a plan that had already posted September posted it
  -- again on the very next scan. Measured in BOTH directions. Refused rather than clamped, and
  -- named: a revision whose new alignment's FIRST period would start on or before the end of the
  -- last period this plan has already run is asking for a second entry in a period that has one.
  --
  -- IT IS THE FREQUENCY CHANGE THAT IS WALLED, not every revision: with the frequency unchanged
  -- the alignment is unchanged, and review finding B1's `period_already_admitted` already binds a
  -- moved due DAY inside a period that has run.
  if p_frequency is distinct from cur.frequency then
    v_covered := clara._plan_covered_through(p_plan);
    if v_covered is not null then
      v_first := clara._plan_period_start(p.authority_from, p_frequency, p_effective_from);
      if v_first <= v_covered then
        -- THE DATE THE REFUSAL OFFERS IS ONE THIS SAME WALL WOULD ACCEPT, computed rather than
        -- guessed: `covered_through + 1` can still fall INSIDE a new-alignment period that began
        -- earlier (a quarterly period starting in July covers a September that a monthly schedule
        -- covered through August), and advertising a date that would be refused again is worse
        -- than advertising none.
        v_earliest := clara._plan_period_start(p.authority_from, p_frequency, v_covered + 1);
        if v_earliest <= v_covered then
          v_earliest := (v_earliest + (case p_frequency when 'monthly' then 1
                                                        when 'quarterly' then 3 else 12 end)
                         * interval '1 month')::date;
        end if;
        raise exception 'this plan has already run through %; a % schedule starting % would cover the period beginning % a second time',
          to_char(v_covered,'YYYY-MM-DD'), p_frequency, to_char(p_effective_from,'YYYY-MM-DD'),
          to_char(v_first,'YYYY-MM-DD')
          using errcode='CLR10',
            detail=jsonb_build_object('reason','period_already_covered',
              'covered_through', to_char(v_covered,'YYYY-MM-DD'),
              'period_start', to_char(v_first,'YYYY-MM-DD'),
              'frequency', p_frequency,
              'earliest_effective_from', to_char(v_earliest,'YYYY-MM-DD'))::text;
      end if;
    end if;
  end if;

  v_next := cur.revision + 1;
  update clara.accounting_plan_revisions set superseded_at = now(), superseded_by = v_actor
   where id = cur.id;
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (p_plan, p.firm_id, p.client_id, p.kind, v_next, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;
  update clara.accounting_plans set current_revision = v_next where id = p_plan;

  perform clara._audit(v_firm, v_actor, null, null, 'revise_accounting_plan', null,
    jsonb_build_object('plan', p_plan, 'revision', v_next, 'superseded', cur.revision,
      'op_key', p_op_key));
  v_result := jsonb_build_object('plan_id', p_plan, 'revision_id', v_rev, 'revision', v_next,
    'superseded_revision', cur.revision, 'status', p.status,
    -- #929 (fix round, ADV-L05-03): self-exclusion by identity -- this plan's own id, not the
    -- basis value it happens to carry (which a sibling may carry byte-identically).
    'overlap_warning', clara._plan_overlap_warning(p.client_id, p_basis, p_plan));
  return clara._finish_op(v_firm, 'revise_accounting_plan', p_op_key, v_result);
end $p929rev$;

create or replace function clara._accrual_plan_core(p_firm uuid, p_client uuid, p_author uuid, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $p929acc$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_ok boolean;
  v_warning jsonb; v_next jsonb;
begin
  -- THE AUTHORITY SHAPE AND ITS RESOLUTION, verbatim from 0193:1466-1512. A Knowledge preference,
  -- a calculation policy or a repeated debit has no row here, so none of them can supply authority.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  if v_ref_kind = 'accounting_work' then
    select exists (select 1 from clara.accounting_work w
                    where w.id = v_ref_id and w.firm_id = p_firm and w.client_id = p_client) into v_ok;
  else
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = p_firm and t.client_id = p_client) into v_ok;
  end if;
  if not v_ok then
    raise exception 'the instruction this accrual cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','authority_ref_unresolved','kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  perform clara._assert_plan_schedule('reversing_journal', p_frequency, p_day_rule, p_day_of_month,
    p_timezone, p_effective_from, p_effective_to, 'next_period_first_day');
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  -- PLACED by 0037 SECTION K's own order (op-receipt -> advisory rung) and above every
  -- clara.accounting_plans row lock in this body. Censused on the live catalog before it was
  -- added: of the fifty-one bodies that take 203005004, not one reads or locks
  -- clara.accounting_plans, so the only new pair is "rung -> plan row" and no body anywhere holds
  -- a plan row while waiting for this rung. Advisory xact locks are re-entrant, so the outer
  -- accrual and prepayment doors re-taking it through this one cost nothing.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, true,
      'next_period_first_day', p_author)
    returning id into v_rev;

  -- #929 (fix round, ADV-L05-03): self-exclusion by identity, as in clara.create_accounting_plan.
  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, true,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'reversing_journal',
      'revision', 1, 'authority', p_authority_ref, 'via', 'create_accrual_adjustment_for'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'reversing_journal', 'next_occurrences', coalesce(v_next,'[]'::jsonb),
    'overlap_warning', v_warning);
end $p929acc$;

-- =====================================================================================
-- SS C  THE OLD SIGNATURE GOES. Nothing reaches it any more: it was owner-only, and its three
--       callers were recut above in this same transaction. `if exists` so a redo converges.
-- =====================================================================================
drop function if exists clara._plan_overlap_warning(uuid,jsonb);

reset role;

-- =====================================================================================
-- SS T  TAIL. Every claim re-READ from the live catalog rather than believed.
-- =====================================================================================
do $w929_tail$
declare v_src text; v_acl text; v_owner text; v_secdef bool; v_vol text; v_cfg text;
        v_rung int; v_rowlock int; v_n int;
begin
  -- (T.0) THE SIGNATURE SWAP HAPPENED, BOTH HALVES OF IT.
  if to_regprocedure('clara._plan_overlap_warning(uuid,jsonb,uuid)') is null then
    raise exception '#929 tail: the three-argument clara._plan_overlap_warning is absent' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)') is not null then
    raise exception '#929 tail: the two-argument clara._plan_overlap_warning survived -- the by-value self-exclusion is still reachable' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_plan_overlap_warning';
  if v_n <> 1 then
    raise exception '#929 tail: clara._plan_overlap_warning resolves at % signatures, not 1', v_n using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb,uuid)'::regprocedure;

  -- (T.1) THE TEMPLATE ARM IS GONE -- by name, not merely by behaviour.
  if position('adjustment_template_overlap' in v_src) > 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning still carries the retired adjustment_template_overlap kind' using errcode='CLR10';
  end if;
  if position('clara.adjustment_templates' in v_src) > 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning still scans clara.adjustment_templates' using errcode='CLR10';
  end if;

  -- (T.2) THE SIBLING ARM SURVIVES, and its self-exclusion is now BY IDENTITY (FIX 1). The
  --       by-value predicate must be GONE: while it stands, a byte-identical sibling is hidden.
  if position('accounting_plan_overlap' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning lost the accounting_plan_overlap kind' using errcode='CLR10';
  end if;
  if position('clara.accounting_plans' in v_src) = 0
     or position('clara.accounting_plan_revisions' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning no longer scans clara.accounting_plans / clara.accounting_plan_revisions' using errcode='CLR10';
  end if;
  if position('p.id is distinct from p_self_plan' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning does not self-exclude by the caller''s own plan id' using errcode='CLR10';
  end if;
  if position('is distinct from p_basis' in v_src) > 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning still self-excludes BY BASIS VALUE -- the total-overlap case is still hidden' using errcode='CLR10';
  end if;
  if position('''active'',''paused''' in v_src) = 0 then
    raise exception '#929 tail: the recut clara._plan_overlap_warning no longer restricts the sibling arm to active/paused plans' using errcode='CLR10';
  end if;

  -- (T.3) EACH CALLER PASSES ITS OWN PLAN ID (FIX 1) AND TAKES THE CLIENT RUNG (FIX 2), and the
  --       rung is ABOVE every clara.accounting_plans row lock in the same body.
  for v_src, v_acl in
    select p.prosrc, p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname in ('create_accounting_plan','revise_accounting_plan','_accrual_plan_core')
     order by p.proname
  loop
    v_rung := position('pg_advisory_xact_lock(203005004' in v_src);
    if v_rung = 0 then
      raise exception '#929 tail: % does not take the client rung 203005004 -- two concurrent creations can still both answer null', v_acl using errcode='CLR10';
    end if;
    if position('clara._plan_overlap_warning(' in v_src) = 0 then
      raise exception '#929 tail: % no longer calls clara._plan_overlap_warning at all', v_acl using errcode='CLR10';
    end if;
    if position(', p_basis, v_plan)' in v_src) = 0 and position(', p_basis, p_plan)' in v_src) = 0 then
      raise exception '#929 tail: % calls clara._plan_overlap_warning without passing its own plan id', v_acl using errcode='CLR10';
    end if;
    v_rowlock := position('from clara.accounting_plans where id' in v_src);
    if v_rowlock > 0 and v_rung > v_rowlock then
      raise exception '#929 tail: % takes the client rung AFTER it locks a clara.accounting_plans row -- that inverts 0238''s order for this rung', v_acl using errcode='CLR10';
    end if;
  end loop;

  -- (T.4) THE POSTURE CEREMONY for the recut advisory: owner, SECURITY DEFINER, pinned
  --       search_path, STABLE, and the EXACT owner-only ACL.
  select pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), '<none>'), coalesce(p.proacl::text,'(null)')
    into v_owner, v_secdef, v_vol, v_cfg, v_acl
    from pg_proc p
   where p.oid = 'clara._plan_overlap_warning(uuid,jsonb,uuid)'::regprocedure;
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

  -- (T.5) THE THREE RECUT CALLERS KEEP THEIR OWN POSTURE. `create or replace function` preserves
  --       an existing ACL, and that is the thing most worth proving after a recut: a door that
  --       silently lost its grant is a door the firm cannot open.
  select coalesce(p.proacl::text,'(null)') into v_acl from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#929 tail: clara.create_accounting_plan''s ACL moved across the recut (acl=%)', v_acl using errcode='CLR10';
  end if;
  select coalesce(p.proacl::text,'(null)') into v_acl from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#929 tail: clara.revise_accounting_plan''s ACL moved across the recut (acl=%)', v_acl using errcode='CLR10';
  end if;
  select coalesce(p.proacl::text,'(null)') into v_acl from pg_proc p
   where p.oid = 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#929 tail: clara._accrual_plan_core gained or lost a grant across the recut (acl=%)', v_acl using errcode='CLR10';
  end if;

  -- (T.6) THE ENDED-PLAN TEST IS STILL RE-MADE UNDER THE PLAN ROW LOCK (0193's review finding S4,
  --       censused by p640.revision.end_race too). The rung added above must not have moved it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  v_rowlock := position('for update' in v_src);
  if v_rowlock = 0 or position('plan_ended' in substr(v_src, v_rowlock)) = 0 then
    raise exception '#929 tail: clara.revise_accounting_plan no longer re-reads plan_ended under the plan row lock' using errcode='CLR10';
  end if;

  raise notice '#929 tail: OK -- clara._plan_overlap_warning''s 0045 template arm is retired (adjustment_template_overlap and clara.adjustment_templates both absent from prosrc); the sibling-plan arm (#909) is the ONLY arm left and now self-excludes by the caller''s own plan id; the two-argument signature is gone; clara.create_accounting_plan / clara.revise_accounting_plan / clara._accrual_plan_core each take the client rung 203005004 above any plan row lock and pass their own plan id, with their ACLs unmoved; and the recut advisory keeps its owner, SECURITY DEFINER flag, search_path, STABLE volatility and owner-only ACL.';
end
$w929_tail$;
