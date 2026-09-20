-- 0280_plan_schedule_yield_wall -- #908: `clara._assert_plan_schedule` GAINS ONE ARM so every
-- caller of the SHARED plan-creation validator -- not only the accrual entrance's own
-- `_assert_accrual_schedule_yields` (0222:806) -- refuses a schedule that reaches no due date
-- inside its own window. Body recut: ONE new statement, added after every existing arm, reusing
-- the already-IMMUTABLE `clara._accrual_schedule_yields` (0222:796) boolean predicate with the
-- same five arguments this function already carries. No signature change, no volatility change
-- (still IMMUTABLE), no new relation, no new function.
-- =====================================================================================
-- Spec of record: issue #908, Agent Brief (2026-09-17T17:02:59Z, the newest and only Agent Brief
-- on the ticket). Filed from wave 2026-09-15 (PR #860) over WAVE-DIGEST.md §3, ratified by
-- DECISIONS.md §3.1 row 12 as follow-up R4: #652 added `_assert_accrual_schedule_yields` at the
-- accrual entrance ONLY; `clara.create_accounting_plan` -- the underlying door #653 recut -- does
-- not share that refusal, so a caller of the shared door directly (bypassing
-- `clara.create_accrual_adjustment`/`clara.revise_accrual_adjustment`) can still record a
-- 'reversing_journal', 'recurring_journal' or 'amortisation_schedule' plan whose day rule can
-- never reach a due date inside its own effective window -- a plan that is recorded and never
-- performs, with no typed refusal to say so.
--
-- WHY THE ARM LIVES HERE AND NOT ON EACH DOOR. `clara._assert_plan_schedule` (0193:1572, recut by
-- 0223) is the ONE validator `clara.create_accounting_plan` (0250:344) and
-- `clara.revise_accounting_plan` (0193:1628, never recut) both call, and it is ALSO reached
-- DIRECTLY -- with `p_kind = 'reversing_journal'` -- by `clara._accrual_plan_core` (0222:961), the
-- private core both accrual doors nest into AFTER their own `_assert_accrual_schedule_yields`
-- check has already passed. Stating the arm here, once, is what makes EVERY caller protected
-- without recutting any of them: the Agent Brief's own "Key interfaces" line says
-- `create_accounting_plan`/`revise_accounting_plan` keep UNCHANGED bodies and inherit the arm for
-- free, exactly as 0223's own amortisation-cadence arm already does for `revise_accounting_plan`
-- (0223:526-529, "revise_accounting_plan needs no edit of its own").
--
-- WHY THE ACCRUAL ENTRANCE KEEPS ITS OWN TOKEN (the Agent Brief's own line). `create_accrual_
-- adjustment` (0222:1134) and `revise_accrual_adjustment` (0222) both call
-- `clara._assert_accrual_schedule_yields` (their OWN CLR10 token,
-- `accrual_schedule_yields_no_occurrence`) at 0222:1182/1283 -- STRICTLY BEFORE either door's
-- nested `clara._accrual_plan_core` ever reaches `_assert_plan_schedule` at 0222:1027. A `raise
-- exception` stops the calling transaction outright, so this file's new arm is NEVER REACHED
-- through either accrual door: it only ever fires for a caller that reaches
-- `_assert_plan_schedule` WITHOUT going through `_assert_accrual_schedule_yields` first --
-- `clara.create_accounting_plan`, `clara.revise_accounting_plan`, and any future caller sharing
-- this validator. This is PROVEN, not assumed:
-- tests/plan-schedule-yield-wall.test.mjs's "pw908.accrual-entrance-unmoved" cell drives
-- `clara.create_accrual_adjustment` with a no-yield shape and asserts it still answers
-- `accrual_schedule_yields_no_occurrence`, never this file's new token.
--
-- WHY A NULL `p_effective_to` IS NOT THIS WALL'S BUSINESS EITHER -- the exact reason
-- `_assert_accrual_schedule_yields`'s own guard (0222:820) already gives. An open-ended plan (no
-- end date) has no window to run out of: `clara._plan_due_events` returns NO rows once its own
-- `p_end` argument is NULL (0193:851, `if ... p_end is null ... then return`), which would make
-- the boolean predicate answer "no occurrence" for every open-ended schedule -- exactly the
-- DEFAULT shape most of this lane's own fixtures and tests use
-- (`accounting-plans-fixtures.mjs`'s `createAccountingPlan` defaults `effectiveTo` to `null`).
-- The new arm is therefore gated on `p_effective_to is not null`, and the ticket's own instruction
-- to "prove no legitimate plan is refused" is measured directly:
-- tests/plan-schedule-yield-wall.test.mjs's "pw908.legitimate-plans" cell drives an open-ended
-- plan AND a bounded, genuinely-reaching plan of EACH of the three kinds (including a
-- 'reversing_journal' plan created DIRECTLY through `create_accounting_plan`, the very bypass the
-- issue names) through the human door and asserts every one is ACCEPTED; the whole pre-existing
-- `accounting-plans.test.mjs` / `accrual-adjustments.test.mjs` / `prepayment-schedule.test.mjs`
-- batteries (every one open-ended by default) are re-run green after this file applies.
--
-- WHAT THIS FILE DOES NOT DO (Agent Brief "Out of scope").
--   * It does not rename `accrual_schedule_yields_no_occurrence` or touch
--     `clara._assert_accrual_schedule_yields` in any way.
--   * It does not touch `clara._plan_due_events` or `clara._accrual_schedule_yields` -- both
--     pinned below, both untouched, both already IMMUTABLE. This file adds no logic of its own,
--     only a call to the second.
--   * It does not recut `clara.create_accounting_plan` or `clara.revise_accounting_plan` -- both
--     pinned below as non-regression; both inherit the new arm through the one function they
--     already call.
--
-- CONSUMER ORDER. None owed. The new arm only ever WIDENS a refusal set (a shape
-- `_assert_plan_schedule` used to accept now raises CLR10 `plan_schedule_yields_no_occurrence`);
-- nothing legal after this migration was illegal before it, and no caller in this estate
-- constructs a deliberately-empty schedule on purpose -- a plan that can never perform is a
-- mistake in every product story this lane tells. Rollback is a successor migration recutting the
-- body back to this file's own pinned pre-image.
--
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE. `create or replace function` on the
-- SAME signature is naturally idempotent DDL -- §A below is unconditional either way. §0's
-- prestate is written to recognise BOTH starting shapes (see its own comment): the measured
-- pre-0280 pre-image (a fresh apply) or this file's own prior output (a redo).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0  PRESTATE. Every body this file touches, or calls without recutting, pinned by pre-image
--     sha256(prosrc) MEASURED off pg_proc on THIS migrated rig (267 migrations, 0001->0272,
--     clara_l05, 2026-09-20) now -- never transcribed from an older migration's own header.
-- =====================================================================================
do $w908_pre$
declare v_sha text; v_prosrc text; v_old boolean; v_own_sha text;
begin
  if to_regprocedure('clara._assert_plan_schedule(text,text,text,int,text,date,date,text)') is null then
    raise exception '#908 prestate: clara._assert_plan_schedule is absent -- 0193/0223 must apply first'
      using errcode='CLR10';
  end if;

  -- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the measured PRE-0280
  -- pre-image (a fresh apply), or this file's OWN prior output, recognised by its own new arm's
  -- token together with every arm the pre-image itself carried (a redo of this exact file,
  -- #957). Anything else -- a body that matches neither -- is refused rather than guessed past.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p
   where p.oid = 'clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure;
  if v_sha = 'e3640588afe00a3c85bcb4198551acb083b6a5d82686b6bba724f28b11367fd7' then
    v_old := true;
  elsif position('plan_schedule_yields_no_occurrence' in v_prosrc) > 0
        and position('_accrual_schedule_yields' in v_prosrc) > 0
        and position('amortisation_schedule' in v_prosrc) > 0
        and position('reversal_collides_with_next_occurrence' in v_prosrc) > 0 then
    v_old := false;
  else
    raise exception '#908 prestate: clara._assert_plan_schedule is neither at its measured pre-0280 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode='CLR10';
  end if;
  v_own_sha := v_sha;   -- captured NOW: v_sha is reused for every pin below, and the closing
                         -- notice names clara._assert_plan_schedule's OWN sha, not the last one.

  -- THE HELPER THIS FILE CALLS BUT DOES NOT RECUT. `clara._accrual_schedule_yields` already does
  -- exactly the check this ticket needs (five arguments, all of which `_assert_plan_schedule`
  -- already carries); this file adds no logic of its own, only a call.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_schedule_yields(text,text,int,date,date)'::regprocedure;
  if v_sha is distinct from 'c75bf4c036cbd54e2c2e737d159cc628e07e3a88fffc46a60e5b82a22add1a42' then
    raise exception '#908 prestate: clara._accrual_schedule_yields has DRIFTED from its measured pre-image (sha %) -- this file''s new arm is derived from its exact behaviour', v_sha
      using errcode='CLR10';
  end if;
  if (select p.provolatile from pg_proc p
       where p.oid = 'clara._accrual_schedule_yields(text,text,int,date,date)'::regprocedure) <> 'i' then
    raise exception '#908 prestate: clara._accrual_schedule_yields is no longer IMMUTABLE -- this file''s own recut relies on that'
      using errcode='CLR10';
  end if;

  -- ...AND THE PREDICATE IT WALKS, one level down -- pinned because the triage comment on record
  -- for this ticket names BOTH as load-bearing ("the yield helper and _plan_due_events are both
  -- IMMUTABLE, so the arm drops in with no signature or volatility change").
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._plan_due_events(date,text,text,int,boolean,date,date,int)'::regprocedure;
  if v_sha is distinct from '66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384' then
    raise exception '#908 prestate: clara._plan_due_events has DRIFTED from its measured pre-image (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- NON-REGRESSION: the two doors that inherit the new arm for free, and the accrual entrance's
  -- own wall, each pinned so a later reader can see this file recuts none of them.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#908 prestate: clara.create_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED and inherits the new arm through _assert_plan_schedule alone', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#908 prestate: clara.revise_accounting_plan has moved from its measured pre-image (sha %) -- this file asserts it is UNTOUCHED', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._assert_accrual_schedule_yields(text,text,int,date,date)'::regprocedure;
  if v_sha is distinct from 'fd504b300a89170b6d030575e2fe1d073f2ec934795209cfc5a2f0db1026ec9f' then
    raise exception '#908 prestate: clara._assert_accrual_schedule_yields has moved from its measured pre-image (sha %) -- the accrual entrance keeps its OWN token, untouched by this file', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#908 prestate: clean -- clara._assert_plan_schedule is at its % (%), clara._accrual_schedule_yields and clara._plan_due_events (both IMMUTABLE) are at their measured pre-images, and clara.create_accounting_plan / clara.revise_accounting_plan / clara._assert_accrual_schedule_yields are all untouched at their own measured pre-images.',
    case when v_old then 'measured post-0223 pre-image' else 'own prior output (a #957 redo)' end, v_own_sha;
end
$w908_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE RECUT. 0223's full body of `clara._assert_plan_schedule`, verbatim, plus ONE new arm
--     after the existing if/else -- the shared door's own wall next to the accrual entrance's.
--     Unconditional: `create or replace function` on the SAME signature converges to the same
--     text whether this is a fresh apply or a #957 redo of this exact file.
-- =====================================================================================
create or replace function clara._assert_plan_schedule(p_kind text, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date,
    p_reversal_day_rule text) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
begin
  if p_frequency is null or p_frequency not in ('monthly','quarterly','annual') then
    raise exception 'unknown plan frequency %', coalesce(p_frequency,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"frequency","constraint":"enum"}';
  end if;
  if p_day_rule is null or p_day_rule not in ('day_of_month','last_day_of_month') then
    raise exception 'unknown plan day rule %', coalesce(p_day_rule,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"enum"}';
  end if;
  if p_day_rule = 'day_of_month' and (p_day_of_month is null or p_day_of_month not between 1 and 28) then
    raise exception 'a day-of-month schedule needs a day between 1 and 28 (use last_day_of_month for a month end)'
      using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"between_1_and_28"}';
  end if;
  if p_day_rule = 'last_day_of_month' and p_day_of_month is not null then
    raise exception 'a last-day-of-month schedule carries no day number' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"absent"}';
  end if;
  if p_timezone is distinct from 'Asia/Kuala_Lumpur' then
    raise exception 'the only supported plan timezone is Asia/Kuala_Lumpur' using errcode='CLR10',
      detail='{"reason":"timezone_unsupported","field":"timezone"}';
  end if;
  if p_effective_from is null then
    raise exception 'a plan needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'a plan cannot end before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_to","constraint":"after_effective_from"}';
  end if;
  if p_kind = 'reversing_journal' then
    if p_reversal_day_rule is not null and p_reversal_day_rule <> 'next_period_first_day' then
      raise exception 'the only supported reversal rule is next_period_first_day' using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"enum"}';
    end if;
    -- THE ONE COLLIDING SHAPE (the header's identity-law note): a monthly accrual on the 1st would
    -- put period k's reversal and period k+1's accrual on the same day, and `unique (plan_id,
    -- due_date)` would refuse the second as a bare 23505 nobody can classify. Named here instead.
    if p_frequency = 'monthly' and p_day_rule = 'day_of_month' and p_day_of_month = 1 then
      raise exception 'a monthly reversing plan cannot accrue on the 1st: its reversal would land on the next accrual''s own day'
        using errcode='CLR10',
          detail='{"reason":"reversal_collides_with_next_occurrence","field":"day_of_month"}';
    end if;
  else
    if p_reversal_day_rule is not null then
      raise exception 'a % plan carries no reversal rule', coalesce(p_kind,'(null)')
        using errcode='CLR10',
          detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"absent"}';
    end if;
    -- #653 - THE AMORTISATION CADENCE IS DERIVED FROM THE FROZEN EVALUATOR, NEVER TYPED, and this
    -- arm is what makes that true on BOTH paths: `clara.create_accounting_plan` (0193:1519) and
    -- `clara.revise_accounting_plan` (0193:1647) are this function's ONLY callers, so
    -- `revise_accounting_plan` needs no edit of its own and a revision cannot move the cadence.
    --
    -- WHY IT MATTERS MORE THAN AN ORDINARY ENUM. `clara.prepayment_schedule_v1` emits whole
    -- calendar months, so every `period_end` it produces IS a month end (0140:1133-1136). The
    -- generic machinery above would happily take `day_of_month = 1..28`, which would put every due
    -- date OFF every line boundary -- and `clara._plan_amortisation_period_line`'s
    -- `period_end = due_date` join would then miss SILENTLY. A schedule that looked configured and
    -- posted nothing, every month, with no audit row, no Work and no notification
    -- (0193:1369-1382), is the worst failure this lane can have; it is refused here instead.
    if p_kind = 'amortisation_schedule' then
      if p_frequency <> 'monthly' then
        raise exception 'an amortisation schedule charges whole calendar months: its frequency is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"frequency","constraint":"monthly"}';
      end if;
      if p_day_rule <> 'last_day_of_month' then
        raise exception 'an amortisation schedule falls on each period''s own month end: its day rule is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"last_day_of_month"}';
      end if;
    end if;
  end if;
  -- #908 - THE SHARED DOOR'S OWN WALL, next to the accrual entrance's `_assert_accrual_schedule_
  -- yields` (0222:806). Every shape this validator refuses on its own terms has already raised by
  -- now, so `clara._accrual_schedule_yields` (0222:796, IMMUTABLE, pinned above unchanged)
  -- receiving these same five arguments answers only for a schedule that is otherwise well-formed
  -- but structurally unable to ever reach a due date inside its own window. An open-ended schedule
  -- (`p_effective_to is null`) has no window to run out of and is skipped, mirroring `_assert_
  -- accrual_schedule_yields`'s own guard (0222:820) -- the accrual doors never let a caller reach
  -- this arm at all (see the header): `clara.create_accrual_adjustment` (0222:1182) and
  -- `clara.revise_accrual_adjustment` both call `_assert_accrual_schedule_yields` -- their OWN
  -- CLR10 token -- BEFORE either nested door ever reaches `_assert_plan_schedule` through
  -- `clara._accrual_plan_core` (0222:1027), so a `raise exception` there stops the transaction
  -- before this arm is ever reached and the accrual entrance keeps its own token exactly as the
  -- Agent Brief asks.
  if p_effective_to is not null
     and not clara._accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month,
           p_effective_from, p_effective_to) then
    raise exception 'this schedule reaches no due date between % and %, so the plan would be recorded and never perform',
      to_char(p_effective_from,'YYYY-MM-DD'), to_char(p_effective_to,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_schedule_yields_no_occurrence',
          'field', case when p_day_rule = 'day_of_month' then 'day_of_month' else 'day_rule' end,
          'constraint','yields_occurrence', 'kind', p_kind, 'frequency', p_frequency,
          'day_rule', p_day_rule,
          'effective_from', to_char(p_effective_from,'YYYY-MM-DD'),
          'effective_to', to_char(p_effective_to,'YYYY-MM-DD'))::text;
  end if;
end $$;
revoke all on function clara._assert_plan_schedule(text,text,text,int,text,date,date,text) from public;

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim re-READ from the live catalog rather than believed.
-- =====================================================================================
do $w908_tail$
declare v_src text; v_sha text; v_acl text; v_owner text; v_secdef bool; v_vol text; v_tok text;
begin
  -- (T.1) THE NEW ARM LANDED: the new token, the field logic's own three parts, the helper it
  -- calls, and the open-ended guard.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure;
  if position('plan_schedule_yields_no_occurrence' in v_src) = 0 then
    raise exception '#908 tail: the recut clara._assert_plan_schedule is missing the new plan_schedule_yields_no_occurrence arm' using errcode='CLR10';
  end if;
  if position('clara._accrual_schedule_yields(' in v_src) = 0 then
    raise exception '#908 tail: the recut clara._assert_plan_schedule no longer calls clara._accrual_schedule_yields' using errcode='CLR10';
  end if;
  if position('p_effective_to is not null' in v_src) = 0 then
    raise exception '#908 tail: the recut clara._assert_plan_schedule lost the open-ended (null effective_to) guard' using errcode='CLR10';
  end if;

  -- (T.2) EVERY ARM 0223 WROTE IS STILL THERE, BY NAME -- this file ADDS, it does not rewrite.
  foreach v_tok in array array['invalid_schedule','timezone_unsupported','reversal_collides_with_next_occurrence',
      'amortisation_schedule','last_day_of_month','day_of_month','reversal_day_rule'] loop
    if position(v_tok in v_src) = 0 then
      raise exception '#908 tail: the recut clara._assert_plan_schedule lost an existing arm''s own token (%)', v_tok
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) NON-REGRESSION: the two doors that inherit the arm for free, and the accrual entrance's
  -- own wall, are BYTE-FOR-BYTE UNMOVED.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4' then
    raise exception '#908 tail: clara.create_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f' then
    raise exception '#908 tail: clara.revise_accounting_plan MOVED -- this file asserts it is untouched' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._assert_accrual_schedule_yields(text,text,int,date,date)'::regprocedure;
  if v_sha is distinct from 'fd504b300a89170b6d030575e2fe1d073f2ec934795209cfc5a2f0db1026ec9f' then
    raise exception '#908 tail: clara._assert_accrual_schedule_yields MOVED -- the accrual entrance keeps its OWN token' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._accrual_schedule_yields(text,text,int,date,date)'::regprocedure;
  if v_sha is distinct from 'c75bf4c036cbd54e2c2e737d159cc628e07e3a88fffc46a60e5b82a22add1a42' then
    raise exception '#908 tail: clara._accrual_schedule_yields MOVED -- this file only CALLS it' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._plan_due_events(date,text,text,int,boolean,date,date,int)'::regprocedure;
  if v_sha is distinct from '66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384' then
    raise exception '#908 tail: clara._plan_due_events MOVED -- this file does not touch it' using errcode='CLR10';
  end if;

  -- (T.4) THE POSTURE CEREMONY. owner, SECURITY DEFINER, pinned search_path, IMMUTABLE, and the
  -- EXACT owner-only ACL -- unmoved by this recut.
  select pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), '<none>'), coalesce(p.proacl::text,'(null)')
    into v_owner, v_secdef, v_vol, v_src, v_acl
    from pg_proc p
   where p.oid = 'clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#908 tail: clara._assert_plan_schedule owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_vol <> 'i' then
    raise exception '#908 tail: clara._assert_plan_schedule is no longer IMMUTABLE (volatility=%)', v_vol
      using errcode='CLR10';
  end if;
  if v_src is distinct from 'search_path=clara, pg_temp' then
    raise exception '#908 tail: clara._assert_plan_schedule''s search_path moved (%)', v_src using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#908 tail: clara._assert_plan_schedule gained a grant (acl=%) -- it must stay owner-only, reached only through create_accounting_plan/revise_accounting_plan/_accrual_plan_core', v_acl
      using errcode='CLR10';
  end if;

  raise notice '#908 tail: OK -- clara._assert_plan_schedule now carries the shared plan_schedule_yields_no_occurrence arm (calling the untouched clara._accrual_schedule_yields, skipping an open-ended p_effective_to), every arm 0223 wrote is still present by name, clara.create_accounting_plan / clara.revise_accounting_plan / clara._assert_accrual_schedule_yields / clara._accrual_schedule_yields / clara._plan_due_events are all byte-for-byte unmoved, and clara._assert_plan_schedule keeps its owner, SECURITY DEFINER flag, search_path, IMMUTABLE volatility and owner-only ACL.';
end
$w908_tail$;
