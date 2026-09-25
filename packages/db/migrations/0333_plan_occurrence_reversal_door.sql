-- 0333_plan_occurrence_reversal_door — #1073 (riders sweep wave, lane 01): A THIRD
-- ACCRUAL/BILL-CONFLICT REMEDY — ONE PERIOD'S OWN CORRECTING ENTRY.
-- =====================================================================================
-- Spec of record: issue #1073's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written), inside the sweep wave's plan of record
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` ("Why each lane is grouped this way", L1:
-- "#1073's third remedy must net to the same ledger state as the existing 'reverse now' for one
-- period, which is only true once #1074 lands"). Domain words: CONTEXT.md — "Accrual reversal",
-- "Plan occurrence", "Settlement candidate row".
--
-- THE GAP THIS CLOSES. When a document-sourced entry posts inside a period an accrual has already
-- posted for, 0302 (#938) surfaces `row_kind='accrual_bill_conflict'` and offers exactly two
-- remedies:
--   * "reverse now" — `clara.request_plan_catch_up` (0193) over a WINDOW running from the flagged
--     occurrence's own due date through the accrual's scheduled reversal date. A catch-up admits
--     EVERY due event of the schedule inside that window (up to its cap of 12), which is what a
--     catch-up is for and is NOT what "settle this one period" is.
--   * "skip this period's next occurrence" — `clara.skip_plan_occurrence` (0302), which marks a
--     FUTURE due date handled and, by its own comment and its own tail, "never touches the CURRENT
--     (already posted) occurrence".
-- Neither is "book the correcting entry for exactly this one conflicting period". This file adds
-- the ONE new door that is, and changes nothing else.
--
-- =====================================================================================
-- THE FIRST MEASUREMENT: NO SUCH DOOR EXISTS, so AC's "whatever plan-lane door already exists for
-- reversing a single occurrence's own accrual leg, or a new one if none does" resolves to "a new
-- one".
--
-- Measured on this lane database (clara_l04, 312 files, max 0332_plan_reversal_posted_basis)
-- before this file was written: exactly FIVE bodies in the whole `clara` schema reach
-- `clara._plan_admit_occurrence` — `clara._accrual_finish` (the configuration door's own tail,
-- primary leg only and it says so), `clara._prepayment_schedule_core`,
-- `clara._record_journal_entry_core`, `clara.request_plan_catch_up` (the window) and
-- `clara.wake_due_plan_occurrences` (the automatic scan). Not one of them takes "one occurrence,
-- named" from a human. This file is the sixth and it is the only one that does.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT, AND A CLAIM THIS HEADER WITHDREW WHEN IT WAS MEASURED.
--
-- This file's first draft argued that the window is WIDER than one period: `clara._plan_reversal_date`
-- (0193:837) answers the first day of the month AFTER `p_due`'s, so on a monthly schedule due on
-- the 1st the next PRIMARY due date would fall on exactly that reversal date and a catch-up would
-- admit the next period's accrual beside the reversal. THAT SCHEDULE DOES NOT EXIST IN THIS
-- ESTATE. `clara._assert_plan_schedule` (0193:1611, restated by 0223:512) refuses
-- `monthly + day_of_month + 1` on a `reversing_journal` plan by name —
-- `reversal_collides_with_next_occurrence` — precisely so period k's reversal never lands on
-- period k+1's accrual day, because `unique (plan_id, due_date)` would otherwise refuse the
-- collision as a bare 23505. The refusal is DRIVEN by the battery
-- (`packages/db/tests/plan-occurrence-reversal-door.test.mjs`, `p1073.scope`, first assertion), and
-- the claim it disproves is recorded here rather than quietly dropped.
--
-- So on every reversing schedule this estate admits, the window "reverse now" sends carries
-- exactly two due events: the flagged period's own primary (which CONVERGES, since it has already
-- posted) and its reversal. THE TWO REMEDIES ADMIT THE SAME OCCURRENCE ON THIS LANE — which is
-- exactly what the ticket predicts when it asks for "the same net state" — and the battery
-- MEASURES that on two identical scenes rather than assuming it.
--
-- WHAT THE THIRD REMEDY ADDS IS THEREFORE NOT A DIFFERENT SET OF OCCURRENCES. It is a different
-- kind of act:
--   * it takes a PERIOD, and resolves that period's scheduled reversal date IN THE DATABASE. The
--     web layer mirrors `clara._plan_reversal_date` by hand today (`accrualReversalDate` in
--     `apps/web/lib/accruals/api.ts`) purely in order to build "reverse now"'s window; a remedy
--     that names a period does not need it to, and a schedule rule with two homes eventually has
--     two answers;
--   * it carries its own receipt (`clara.op_receipts`, fn `reverse_plan_occurrence`) and its own
--     audit verb, so the firm's history records what the person actually did rather than "a
--     catch-up over a two-day window";
--   * it refuses PER OCCURRENCE. A window that is not yet due refuses `catch_up_in_future` naming
--     the window's end; this door passes the admission core's own `not_yet_due` naming the
--     occurrence;
--   * and the "exactly one occurrence" guarantee is STRUCTURAL rather than a property of today's
--     schedules: the tail refuses a body that so much as mentions `clara._plan_due_events(`, so no
--     future schedule shape and no future catch-up cap can widen this act.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: "THE SAME NET STATE" IS ONLY TRUE BECAUSE OF 0332 (#1074), AND IT IS A
-- COMPARISON RATHER THAN A PROMISE.
--
-- Both remedies end in the SAME body — `clara._plan_admit_occurrence`, which since 0332 builds a
-- reversal from the lines the occurrence's own entry POSTED rather than from the plan's live
-- revision. So "this door nets what 'reverse now' nets for that one period" is true by
-- construction: it is the same admission of the same occurrence, reached without a window. The
-- battery still measures it on two identically configured clients rather than asserting it, because
-- a claim about the ledger that nobody summed is not evidence.
--
-- =====================================================================================
-- WHAT THIS DOOR OWNS, AND WHAT IT DELIBERATELY DOES NOT (the #1051/#1080 law: a wall is written
-- ONCE).
--
-- It owns exactly the four things it needs in order to name the right occurrence:
--   1. the bookkeeper floor, through `clara._plan_door_ctx` with the typed-reason wrapper
--      `clara.skip_plan_occurrence` and `clara.correct_accrual_adjustment` already use (the raw
--      body raises a bare CLR04 and a surface cannot classify it);
--   2. the op-key reservation and the receipt (`clara._reserve_op` / `clara._finish_op`);
--   3. `p_due` really is a due date of this plan's live schedule — the same
--      `_plan_due_index_on_or_before` + `_plan_due_nth` pair, and the same
--      `accrual_occurrence_not_found` token, `clara.skip_plan_occurrence` uses for its own
--      `p_after_due`. A second spelling for one fact would be a second vocabulary;
--   4. this plan HAS a reversal leg at all (`accounting_plan_revisions.auto_reverse`, which
--      `ck_plan_revisions_auto_reverse` (0193:561) ties to `plan_kind = 'reversing_journal'`).
--      This wall is NOT redundant and was measured rather than assumed: on a `recurring_journal`
--      plan whose schedule is monthly/last_day_of_month, `clara._plan_primary_for_reversal`
--      resolves the reversal date back to a real primary due date, so the admission core would
--      have admitted a swapped-sides entry for a plan whose revision says it never reverses.
--      Refused here BY NAME (`plan_does_not_reverse`), before anything is reserved or written.
--
-- Everything else is the admission core's answer and is passed through rather than re-decided:
-- the plan's status, the client's status, the live revision, the authority window, the due gate on
-- the house legal date, convergence, and the ORPHAN WALL ("a reversal with no posted accrual behind
-- it"). Copying any of those here would be the third copy of a wall that #1051 (0330) and #1080
-- (0331) exist to have stopped making.
--
-- A REFUSAL IS RAISED, NOT REPORTED. `clara.request_plan_catch_up` answers a window with a list of
-- per-event outcomes and commits its receipt either way, which is right for a window. This door is
-- ONE act a person asked for by name, so it follows `clara.skip_plan_occurrence` instead: every way
-- it cannot act is a typed raise, the transaction rolls back (so the op key is free for a real
-- retry rather than pinned to a receipt that recorded nothing), and the DoorRefusal surfaces
-- verbatim on the two surfaces that offer it. The admission core's own `reason` token and its own
-- `code` travel outward unchanged — this file mints no refusal vocabulary for anything the core
-- already names.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (the ticket's own out-of-scope lines, made structural
-- rather than promised):
--   * it does not touch `clara.request_plan_catch_up` or `clara.skip_plan_occurrence`. Both are
--     sha-pinned in the prestate AND re-pinned at the tail, and their ACLs are re-read there too.
--   * it does not touch `clara.list_review_queue`, the read that surfaces the conflict item. It is
--     NOT sha-pinned: another lane of this very wave adds a row kind to that body, and pinning a
--     body a sibling lane writes is exactly the collision the wave's plan of record forbids. What
--     the tail asserts instead is structural — the `accrual_bill_conflict` arm is still there.
--   * it does not touch `clara._plan_admit_occurrence`, `clara._plan_occurrence_basis`,
--     `clara._plan_posted_entry_lines` or any per-kind arm. The core is pinned at both ends; this
--     file is a caller.
--   * it mints no table, no CHECK, no chart row, no trigger and no grant beyond the one EXECUTE the
--     new door needs.
--
-- REDO-SAFE (#957). Every statement below is `create or replace function`, `revoke`, `grant` or
-- `comment on`, each idempotent by construction, and the prestate is BIMODAL on the one name this
-- file mints: it admits either ABSENCE (first apply) or this file's own output (redo) and refuses
-- anything else — so a name another lane had already taken RED-FAILS instead of being silently
-- replaced. This file has NO data-dependent branch: every prestate and tail arm reads `pg_proc`
-- and `pg_namespace` only, so no arm needs rows to be entered before it is applied.
-- =====================================================================================

do $p1073_pre$
declare
  v_door text := 'clara.reverse_plan_occurrence(uuid,date,text)';
  v_core text := 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)';
  v_revdate text := 'clara._plan_reversal_date(date)';
  v_ctx text := 'clara._plan_door_ctx(uuid,integer)';
  v_idx text := 'clara._plan_due_index_on_or_before(date,text,text,integer,date)';
  v_nth text := 'clara._plan_due_nth(date,text,text,integer,integer)';
  v_model text := 'clara._plan_run_model()';
  v_catchup text := 'clara.request_plan_catch_up(uuid,date,date,text)';
  v_skip text := 'clara.skip_plan_occurrence(uuid,date,text,text)';
  v_queue text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  -- MEASURED ON THIS LANE DATABASE (clara_l04, 312 files, max
  -- 0332_plan_reversal_posted_basis) immediately before this file was written — never copied from
  -- an older migration's header. 0330, 0331 and 0332 are files of THIS lane and applied before
  -- this one, so `_plan_admit_occurrence` is pinned at what is LIVE AFTER #1074 recut it, exactly
  -- as the wave's own rule requires.
  c_core constant text := '5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb';
  c_revdate constant text := 'faaaafe9d74650a06eca2675619d9a509ebf6128d086fa6c269a35e04759b8b3';
  c_ctx constant text := '97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b';
  c_idx constant text := 'edd611e5d5a1da8da88aaf0ac4dcc13c411f1d4aef98ec16cba8947bd47d692d';
  c_nth constant text := 'f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e';
  c_model constant text := 'c0bdc01a3f61a9ac384de879f124336d28c961468800eecb2dcdd696306913c3';
  c_catchup constant text := '4ed6f110e05717f387a7ca3715342597e64a63a4595b5ca4f60f2cc48f0d31b2';
  c_skip constant text := '872edfce81e27aa43a077a9ce8a4367531c0dcec72e5dc4731d42d6f9b506a37';
  -- This file's own output, for the redo branch of the bimodal pin below.
  c_door_post constant text := '3f6f656d805ebecbf09999591eb1dd1b7fd73eb39d5f9035375d9f56eb79dd86';
  v_sha text; v_branch text; v_n int; v_src text; r record;
begin
  -- THE FIVE BODIES THIS DOOR STANDS ON. Pinned UNCONDITIONALLY: what this door admits, refuses
  -- and posts is THEIR behaviour, reached through one thin act, so a drifted one would change the
  -- remedy's meaning while this file's own diff looked like a new function nobody had touched.
  for r in select * from (values
      (v_core, c_core), (v_revdate, c_revdate), (v_ctx, c_ctx), (v_idx, c_idx), (v_nth, c_nth),
      (v_model, c_model)) as t(sig, sha) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#1073 prestate: % is absent -- 0193/0332 must apply first', r.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.sha then
      raise exception '#1073 prestate: % has DRIFTED from its measured image (expected %, got %) -- this door delegates to it and must not do so blind',
        r.sig, r.sha, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- THE TWO EXISTING REMEDIES, PINNED BECAUSE THE TICKET PUTS THEM OUT OF SCOPE. "This file does
  -- not change either of them" is a claim about bytes, so it is checked as one -- here and again
  -- at the tail.
  for r in select * from (values (v_catchup, c_catchup), (v_skip, c_skip)) as t(sig, sha) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#1073 prestate: % is absent -- 0193/0302 must apply first', r.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.sha then
      raise exception '#1073 prestate: the EXISTING remedy % has DRIFTED (expected %, got %) -- this file adds a THIRD remedy beside two it must leave byte-identical',
        r.sig, r.sha, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- THE READ THAT SURFACES THE CONFLICT ITEM. Asserted STRUCTURALLY, never sha-pinned: another
  -- lane of this wave splices a new row_kind onto this same body, and a sha pin here would make
  -- two lanes collide over a body only one of them writes. What this file needs is that the arm it
  -- offers a remedy for still exists.
  if to_regprocedure(v_queue) is null then
    raise exception '#1073 prestate: % is absent -- 0011/0302 must apply first', v_queue
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_queue::regprocedure;
  if position('accrual_bill_conflict' in v_src) = 0 then
    raise exception '#1073 prestate: % carries no accrual_bill_conflict arm -- 0302 must apply first, and this file offers a third remedy for exactly that row kind',
      v_queue using errcode = 'CLR10';
  end if;

  -- THE ONE NAME THIS FILE MINTS, BIMODALLY: absent (first apply) or this file's own output
  -- (redo). Anything else is a name somebody else has taken and this file refuses to replace it.
  if to_regprocedure(v_door) is null then
    v_branch := 'first';
  else
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_door::regprocedure;
    if v_sha is distinct from c_door_post then
      raise exception '#1073 prestate: % already exists with a body this file did not write (got %) -- refusing to replace it',
        v_door, v_sha using errcode = 'CLR10';
    end if;
    v_branch := 'redo';
  end if;

  -- THE CALLER ROSTER OF THE ADMISSION CORE, BEFORE. Five today; the tail asserts six and names
  -- the sixth. A census over `prosrc` text, never over a digest of text-ordered rows.
  select count(*)::int into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc like '%_plan_admit_occurrence%';
  if v_n <> (case v_branch when 'first' then 5 else 6 end) then
    raise exception '#1073 prestate: % bodies reach clara._plan_admit_occurrence on the % branch, expected % -- the census this file grows by exactly one was measured against a different chain',
      v_n, v_branch, (case v_branch when 'first' then 5 else 6 end) using errcode = 'CLR10';
  end if;

  raise notice '#1073 prestate: % APPLY -- clara._plan_admit_occurrence is byte-identical to its #1074 image, clara._plan_reversal_date / _plan_door_ctx / _plan_due_index_on_or_before / _plan_due_nth / _plan_run_model to their measured ones, and BOTH existing remedies (request_plan_catch_up, skip_plan_occurrence) are byte-unchanged; clara.list_review_queue still carries its accrual_bill_conflict arm; % bodies reach the admission core.',
    upper(v_branch), v_n;
end
$p1073_pre$;

-- =====================================================================================
-- §A  THE THIRD REMEDY. One human act, one named period, one occurrence.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.reverse_plan_occurrence(p_plan uuid, p_due date, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $p1073rev$
declare
  v_actor uuid; v_firm uuid; v_ctx record; r record;
  v_dedupe jsonb; v_result jsonb; v_answer jsonb;
  v_k int; v_rev_due date; v_reason text; v_code text;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'reversing one period of a plan requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_due is null then
    raise exception 'reversing one period of a plan names that period''s own due date'
      using errcode='CLR10', detail='{"reason":"invalid_request","field":"due","constraint":"required"}';
  end if;

  -- THE FLOOR, WITH A TYPED REASON (the skip_plan_occurrence / correct_accrual_adjustment idiom:
  -- clara._plan_door_ctx raises a bare CLR04/CLR11 and a surface cannot classify it).
  begin
    select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  exception when sqlstate 'CLR04' then
    raise exception 'reversing one period of a plan requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm;

  -- THE REQUEST HASH IS (plan, due) AND NOTHING ELSE: the reversal date below is DERIVED from the
  -- period, so a replay of the same key for the same period is the same request by construction.
  v_dedupe := clara._reserve_op(v_firm, 'reverse_plan_occurrence', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'due', p_due)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this reversal key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- RUNG 1, TAKEN HERE RATHER THAN LEFT TO THE CORE. The core takes this very lock at its own
  -- first statement (re-entrantly, in this same transaction); taking it BEFORE the revision is
  -- read is what keeps the schedule this door validates `p_due` against, and the schedule the core
  -- then admits under, the same one.
  perform 1 from clara.accounting_plans where id = p_plan for update;

  select * into r from clara.accounting_plan_revisions
   where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;

  -- THIS PLAN REVERSES AT ALL. ck_plan_revisions_auto_reverse (0193) ties `auto_reverse` to
  -- plan_kind='reversing_journal'; a plan without it has no reversal leg in its schedule, and the
  -- admission core would still resolve one from the date arithmetic alone.
  if not coalesce(r.auto_reverse, false) then
    raise exception 'this plan does not reverse its occurrences'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_does_not_reverse',
          'plan_kind', r.plan_kind)::text;
  end if;

  -- `p_due` IS A DUE DATE OF THIS SCHEDULE -- the same pair, and the same typed reason, that
  -- clara.skip_plan_occurrence asks of its own `p_after_due`. One fact, one vocabulary.
  v_k := clara._plan_due_index_on_or_before(r.effective_from, r.frequency, r.day_rule,
           r.day_of_month, p_due);
  if v_k is null
     or clara._plan_due_nth(r.effective_from, r.frequency, r.day_rule, r.day_of_month, v_k) <> p_due then
    raise exception 'this plan''s schedule has no occurrence due on %', to_char(p_due,'YYYY-MM-DD')
      using errcode='CLR10', detail='{"reason":"accrual_occurrence_not_found","field":"due"}';
  end if;

  -- THE SCHEDULE'S OWN REVERSAL DATE FOR THAT PERIOD, RESOLVED HERE. The web layer used to mirror
  -- this rule by hand in order to build "reverse now"'s window; a remedy that names a PERIOD does
  -- not need it to, and a date rule with two homes eventually has two answers.
  v_rev_due := clara._plan_reversal_date(p_due);

  -- THE ONE ADMISSION. Everything this door does not own is the core's: the plan's status, the
  -- client's, the authority window, the due gate on the house legal date, convergence, and the
  -- orphan wall that refuses a reversal with no posted accrual behind it. Re-attempt is allowed
  -- for the same reason a human catch-up allows it (0193, review finding S7): a Work the person
  -- cancelled, or one that failed, posted nothing and leaves the period owed.
  v_answer := clara._plan_admit_occurrence(p_plan, v_rev_due, 'reversal', clara._plan_run_model(),
                p_allow_reattempt => true);

  if not coalesce((v_answer ->> 'admitted')::boolean, false) then
    -- A REFUSAL IS RAISED, so the transaction rolls back and the op key stays free for a real
    -- retry. The core's own token travels outward unchanged; only the CONVERGED answer, which
    -- carries no `reason` of its own, is named here -- and it is named the way the sibling door
    -- names the same shape of fact.
    v_reason := coalesce(v_answer ->> 'reason',
                  case when coalesce((v_answer ->> 'converged')::boolean, false)
                       then 'reversal_already_admitted' else 'unclassified' end);
    v_code := coalesce(v_answer ->> 'code',
                case v_reason
                  when 'reversal_already_admitted' then 'CLR13'
                  when 'plan_not_found' then 'CLR11'
                  when 'plan_paused' then 'CLR10'
                  when 'plan_ended' then 'CLR10'
                  when 'client_inactive' then 'CLR13'
                  when 'no_live_revision' then 'CLR13'
                  when 'outside_authority_window' then 'CLR10'
                  when 'not_yet_due' then 'CLR10'
                  else 'CLR13' end);
    raise exception 'this period''s reversal was not admitted (%)', v_reason
      using errcode = v_code,
        detail = (v_answer || jsonb_build_object('reason', v_reason,
                    'due_date', to_char(p_due,'YYYY-MM-DD'),
                    'reversal_due_date', to_char(v_rev_due,'YYYY-MM-DD')))::text;
  end if;

  perform clara._audit(v_firm, v_actor, null, null, 'reverse_plan_occurrence', null,
    jsonb_build_object('plan', p_plan, 'due_date', to_char(p_due,'YYYY-MM-DD'),
      'reversal_due_date', to_char(v_rev_due,'YYYY-MM-DD'),
      'occurrence', v_answer ->> 'occurrence_id', 'work', v_answer ->> 'work_id',
      'reverses_entry', v_answer ->> 'reverses_entry_id', 'op_key', p_op_key));

  -- THE CORE'S ANSWER TRAVELS VERBATIM under `occurrence`, the same way clara._accrual_finish
  -- carries it: nothing it says is re-spelled here, so there is no second version of the truth.
  v_result := jsonb_build_object('plan_id', p_plan,
    'due_date', to_char(p_due,'YYYY-MM-DD'),
    'reversal_due_date', to_char(v_rev_due,'YYYY-MM-DD'),
    'leg', 'reversal', 'reversed', true, 'occurrence', v_answer);
  return clara._finish_op(v_firm, 'reverse_plan_occurrence', p_op_key, v_result);
end $p1073rev$;

revoke all on function clara.reverse_plan_occurrence(uuid,date,text) from public;
grant execute on function clara.reverse_plan_occurrence(uuid,date,text) to clara_authenticated;

comment on function clara.reverse_plan_occurrence(uuid,date,text) is
  '#1073 (0333): THE THIRD accrual/bill-conflict remedy -- book the correcting entry for exactly '
  'ONE named period. `p_due` is that period''s own PRIMARY due date, which is the value '
  'clara.list_review_queue''s accrual_bill_conflict row carries in `period`; the door resolves the '
  'scheduled reversal date itself through clara._plan_reversal_date and admits exactly one '
  'occurrence through clara._plan_admit_occurrence. It is NOT a catch-up: it never walks a window, '
  'so it can never admit another period''s accrual the way a window whose last day is also a due '
  'date does. Since 0332 (#1074) the admitted reversal undoes what that period actually POSTED, so '
  'this leaves the same net ledger state clara.request_plan_catch_up leaves for that one period. '
  'bookkeeper+, clara_authenticated ONLY (no OBO twin, no agent lane, no wake wrapper -- the same '
  'human-only posture clara.skip_plan_occurrence and clara.correct_accrual_adjustment carry); '
  'idempotent on (firm, reverse_plan_occurrence, op_key). Every way it cannot act is a typed RAISE '
  'rather than a reported outcome, so a refusal rolls back and leaves the key free: its own four '
  '(invalid_op_key, invalid_request, plan_does_not_reverse, accrual_occurrence_not_found), plus '
  'whatever the admission core answers -- passed outward under the core''s own reason and code, '
  'with reversal_already_admitted naming the core''s converged answer.';

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written.
-- Nothing here writes a row.
-- =====================================================================================
do $p1073_tail$
declare
  v_door text := 'clara.reverse_plan_occurrence(uuid,date,text)';
  v_core text := 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)';
  v_catchup text := 'clara.request_plan_catch_up(uuid,date,date,text)';
  v_skip text := 'clara.skip_plan_occurrence(uuid,date,text,text)';
  v_queue text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  c_core constant text := '5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb';
  c_catchup constant text := '4ed6f110e05717f387a7ca3715342597e64a63a4595b5ca4f60f2cc48f0d31b2';
  c_skip constant text := '872edfce81e27aa43a077a9ce8a4367531c0dcec72e5dc4731d42d6f9b506a37';
  v_sha text; v_posture text; v_src text; v_n int; v_marker text; r record;
begin
  -- T.1 · the door resolves at exactly the signature the grant and the web layer name.
  if to_regprocedure(v_door) is null then
    raise exception '#1073 tail: % does not resolve', v_door using errcode='CLR10';
  end if;

  -- T.1b · posture: SECURITY DEFINER, clara_fn_owner, pinned search_path, VOLATILE (it writes).
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p where p.oid = v_door::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | v | search_path=clara, pg_temp' then
    raise exception '#1073 tail: the door''s posture is not the expected SECURITY DEFINER shape -- got {%}',
      v_posture using errcode='CLR10';
  end if;

  -- T.1c · ACL: clara_authenticated alone. No PUBLIC, no clara_runtime (no OBO twin -- this is a
  --        human-only lane), no agent read lane, no wake role.
  if not has_function_privilege('clara_authenticated', v_door::regprocedure, 'execute') then
    raise exception '#1073 tail: clara_authenticated cannot execute the one-period reversal door'
      using errcode='CLR10';
  end if;
  foreach v_marker in array array['public','clara_runtime','clara_agent_ro','clara_agent_rw',
      'clara_wake_interactive','clara_wake_scan','clara_wake_document','clara_wake_reconcile'] loop
    if to_regrole(v_marker) is not null
       and has_function_privilege(v_marker, v_door::regprocedure, 'execute') then
      raise exception '#1073 tail: % can execute the one-period reversal door -- this is a bookkeeper-human-only lane',
        v_marker using errcode='CLR10';
    end if;
  end loop;

  -- T.1d · the house shape, as independent tokens in the body.
  select p.prosrc into v_src from pg_proc p where p.oid = v_door::regprocedure;
  foreach v_marker in array array['clara._plan_door_ctx(p_plan, clara.role_rank(''bookkeeper''))',
      'clara._reserve_op(', 'clara._finish_op(', 'clara._audit(', 'for update',
      'clara._plan_due_index_on_or_before(', 'clara._plan_due_nth(', 'clara._plan_reversal_date(',
      'clara._plan_admit_occurrence(', '''reversal''', 'invalid_op_key', 'invalid_request',
      'plan_does_not_reverse', 'accrual_occurrence_not_found', 'reversal_already_admitted'] loop
    if position(v_marker in v_src) = 0 then
      raise exception '#1073 tail: the one-period reversal door is missing "%"', v_marker
        using errcode='CLR10';
    end if;
  end loop;

  -- T.1e · THE SCOPE, MADE STRUCTURAL. "It is not a catch-up" is the whole of what this ticket
  --        adds, so it is checked rather than claimed: the body walks no window and nests no
  --        catch-up.
  foreach v_marker in array array['clara._plan_due_events(', 'clara.request_plan_catch_up(',
      'clara.skip_plan_occurrence('] loop
    if position(v_marker in v_src) <> 0 then
      raise exception '#1073 tail: the one-period reversal door reaches "%" -- it must admit exactly ONE occurrence and must not touch either existing remedy',
        v_marker using errcode='CLR10';
    end if;
  end loop;

  -- T.2 · the admission core is byte-identical to its #1074 image. This file is a CALLER.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_core::regprocedure;
  if v_sha is distinct from c_core then
    raise exception '#1073 tail: % moved while this file applied (got %)', v_core, v_sha
      using errcode='CLR10';
  end if;

  -- T.3 · THE TWO EXISTING REMEDIES, byte-identical AND with their ACLs unmoved. The ticket's
  --       out-of-scope line, checked instead of promised.
  for r in select * from (values (v_catchup, c_catchup), (v_skip, c_skip)) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.sha then
      raise exception '#1073 tail: the EXISTING remedy % moved while this file applied (got %)',
        r.sig, v_sha using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', r.sig::regprocedure, 'execute')
       or has_function_privilege('public', r.sig::regprocedure, 'execute') then
      raise exception '#1073 tail: the EXISTING remedy %''s grant posture moved', r.sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 · THE CENSUS. Six bodies reach the admission core now, and the sixth is this door. The
  --       comparison is over `prosrc` text and `proname`, never over a digest of text-ordered row
  --       content, so no collation can change the answer.
  select count(*)::int into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc like '%_plan_admit_occurrence%';
  if v_n <> 6 then
    raise exception '#1073 tail: % bodies reach clara._plan_admit_occurrence, expected 6 (the five measured before this file, plus this door)',
      v_n using errcode='CLR10';
  end if;
  if position('_plan_admit_occurrence' in v_src) = 0 then
    raise exception '#1073 tail: the one-period reversal door does not reach the admission core'
      using errcode='CLR10';
  end if;

  -- T.4b · …and NOTHING nests this door. It is a leaf a person reaches from outside; an internal
  --        caller would be a second, ungoverned entrance to the same act.
  select count(*)::int into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc like '%reverse_plan_occurrence%';
  if v_n <> 1 then
    raise exception '#1073 tail: % bodies mention clara.reverse_plan_occurrence, expected exactly 1 (itself)',
      v_n using errcode='CLR10';
  end if;

  -- T.5 · the read that surfaces the conflict item still carries its arm. STRUCTURAL, never a sha:
  --       a sibling lane of this wave writes that body.
  select p.prosrc into v_src from pg_proc p where p.oid = v_queue::regprocedure;
  if position('accrual_bill_conflict' in v_src) = 0 then
    raise exception '#1073 tail: % lost its accrual_bill_conflict arm while this file applied',
      v_queue using errcode='CLR10';
  end if;

  raise notice '#1073 tail: clara.reverse_plan_occurrence is live, SECURITY DEFINER, owned by clara_fn_owner with a pinned search_path, executable by clara_authenticated alone, reaches no window walker, and is nested by nothing; clara._plan_admit_occurrence and BOTH existing remedies are byte-unchanged with their grants unmoved; 6 bodies now reach the admission core.';
end
$p1073_tail$;
