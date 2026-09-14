-- 0198_chat_clarify_expiry — #720 Half 1 (successor to #629 / 0180; Half 2 is #764):
-- THE 14-DAY CLARIFICATION DEADLINE GAINS AN ENFORCER ON THE CHAT LANE.
-- =====================================================================================
-- Spec of record: issue #720, the owner's decision of 2026-09-13 ("ship Half 1 now; Half 2 becomes
-- a successor ticket") and the Agent Brief in that same comment. Domain words: CONTEXT.md — "Chat
-- clarification", "Delivery state". ARCHITECTURE §6 (the #629 paragraph) and §11 both record the
-- chat-lane gap this file closes, by ticket number.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.expire_due_interruptions` — 0180 §G, the only
-- enforcer the 14-day deadline has ever had — stops asking whether the past-due row belongs to a
-- Work, so a past-due CHAT clarification is moved to `expired` under the SAME rules a past-due
-- Work question already is: the function's own clock, a bounded batch per cycle, skip-locked, a
-- runtime-only EXECUTE, one audit row per swept row and one NOTIFY per non-empty sweep.
--
-- =====================================================================================
-- ONE PREDICATE. NOT A REWRITE.
--
-- 0180 §G scoped the sweep `where status = 'pending' and work_id is not null` and its header said
-- why, in the same breath as the finding it was declining to act on:
--
--   "SCOPED TO WORK QUESTIONS (`work_id is not null`) AND NOTHING ELSE. Expiring a past-due CHAT
--    clarify would resume a chatTurn run with `{kind:'expired'}` — plausibly the right behaviour,
--    and categorically not this ticket's subject."
--
-- The owner has now ruled that it IS the right behaviour, so `and work_id is not null` is deleted
-- and NOTHING ELSE in the body moves. Every other arm is carried over verbatim from 0180 and
-- re-measured in §T below, arm by arm, against the COMMITTED catalog:
--
--   * the cutoff stays `expires_at < clock_timestamp()` and stays PARAMETERLESS — a caller-supplied
--     cutoff would let the runtime lane expire questions that are not due (0180's own words);
--   * the batch stays `limit greatest(coalesce(p_limit, 50), 0)` and the scan stays
--     `order by expires_at ... for update skip locked`, so two cycles never fight over one row;
--   * the optional `p_firm` narrowing stays (TEST-SCOPING; production passes null);
--   * the audit stays ONE `clara._audit(..., 'expire_due_interruptions', ...)` row per swept row;
--   * the NOTIFY stays ONE `pg_notify('clara_runtime_ctl','')` per NON-EMPTY sweep;
--   * the return shape stays `{expired, question_ids}`;
--   * the posture stays SECURITY DEFINER, `search_path = clara, pg_temp`, owner `clara_fn_owner`,
--     PUBLIC revoked, EXECUTE to `clara_runtime` and to nobody else.
--
-- WORK-QUESTION EXPIRY IS THEREFORE UNCHANGED IN BEHAVIOUR. A row with `work_id is not null` that
-- was swept before this file is swept by it now, in the same order, under the same bound, with the
-- same audit row and the same notify. The only rows whose treatment changes are the ones that were
-- previously EXCLUDED.
--
-- WHY A CHAT ROW'S AUDIT ENTRY IS SAFE. The audit payload is
-- `jsonb_build_object('question', r.id, 'work', r.work_id)`. On a chat row `r.work_id` is SQL NULL,
-- which `jsonb_build_object` records as a jsonb null under the `work` key — a recorded absence, not
-- an error and not a missing key. §T pins the payload expression literally; the executed proof (a
-- real swept chat row whose audit entry carries `work` as jsonb null) is
-- `packages/db/tests/chat-clarify-expiry.test.mjs`, because planting one here would need a firm, a
-- client, a user and a chat task (`agent_interruptions.task_id` and `firm_id` are both NOT NULL,
-- 0006:194-195) — a fixture a tail census has no business leaving behind.
--
-- =====================================================================================
-- DEPLOY ORDER. NO CONSUMER-FIRST OBLIGATION, and the ground is structural:
--
--   * the runtime's only caller is `expirePastDueInterruptions` (packages/runtime/lib/control.mjs),
--     which probes for 0180's delivery columns BEFORE any statement naming the verb is parsed and
--     returns `{expired:0}` when they are absent. A runtime image that starts AHEAD of this file
--     therefore calls the 0180 body and sweeps Work questions only — the behaviour it has today.
--   * a runtime image that starts BEHIND this file calls the same one-argument-shape verb: the
--     signature, the return shape and the grant are untouched, so nothing on the caller's side has
--     to move in step.
--   * the rows this file newly admits are delivered by machinery that is ALREADY GENERIC: the
--     control listener leases any terminal interruption (`status in ('answered','expired',
--     'cancelled')`, no work_id predicate), `resumePayloadFor` answers `{kind:'expired'}` for any
--     expired row, the chat turn's parked hook is typed `answer | expired | cancelled` in every
--     deployed chatTurn version, and `clara.settle_chat_turn` (0006) allows the `expired` outcome
--     and the `awaiting_input -> expired` task transition its trigger already permits.
--
-- THE FIRST HOSTED SWEEP WILL EXPIRE HISTORICAL ROWS, and that is the point of the ticket rather
-- than a side effect: every chat clarification past its 14 days has been sitting `pending` since
-- 0006. The release session records HOW MANY, by counting them BEFORE the runtime is allowed to
-- sweep (the query is in this file's release note, §R).
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE, EXACTLY AS BEFORE.
--
-- clara.expire_due_interruptions                             (runtime lane)
--   (raises nothing; returns the ids it expired)
--
-- AND THE TWO DOORS THIS FILE DOES NOT TOUCH KEEP THEIR PAIRS:
--   clara.answer_interruption  CLR13 'the clarify has expired'        — a past-due row still pending
--                              CLR13 'interruption is not pending (expired)' — after the sweep
--   clara.answer_work_question CLR13 detail.reason='expired'          — unchanged, 0180 §E
-- Both refusals are CLR13 and both refuse. The sweep changes WHICH of the two sentences a late
-- chat answerer reads, because it moves the status before they knock; it opens no door.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w720_pre$
declare n text; v_src text; v_missing text;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form. `_audit` and
  -- `agent_user_id` are called from inside the body; the verb itself must already exist because
  -- this file REPLACES it rather than creating it.
  foreach n in array array[
    'clara.expire_due_interruptions(integer,uuid)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara.agent_user_id()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#720 prestate: prerequisite absent: % (migration 0180 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the relation and the two columns the predicate reads.
  if to_regclass('clara.agent_interruptions') is null then
    raise exception '#720 prestate: clara.agent_interruptions is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='agent_interruptions' and column_name='work_id') then
    raise exception '#720 prestate: clara.agent_interruptions.work_id is absent (migration 0180 has not been applied)'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='agent_interruptions' and column_name='expires_at') then
    raise exception '#720 prestate: clara.agent_interruptions.expires_at is absent' using errcode='CLR10';
  end if;

  -- 0.3 · EXACTLY ONE body of this name. A recut that created an overload instead of replacing the
  -- live body would leave the runtime calling whichever one resolves — 0105's own tail states this
  -- rule for clara.begin_chat_turn, and it is the same hazard here.
  select count(*)::text into v_src from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='expire_due_interruptions';
  if v_src <> '1' then
    raise exception '#720 prestate: clara.expire_due_interruptions has % bodies (expected exactly 1)', v_src
      using errcode='CLR10';
  end if;

  -- 0.4 · THE LIVE BODY IS 0180's, AND IT IS NOT ALREADY RECUT. Measured from prosrc rather than
  -- assumed from a file listing: this file's whole claim is "one predicate leaves and nothing else
  -- moves", and that claim is only checkable against the text that is actually installed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.expire_due_interruptions(integer,uuid)'::regprocedure;
  if position('work_id is not null' in v_src) = 0 then
    raise exception '#720 prestate: the live clara.expire_due_interruptions is ALREADY unscoped — this file has nothing to remove and would silently re-write somebody else''s body'
      using errcode='CLR10';
  end if;
  v_missing := '';
  if position('for update skip locked' in v_src) = 0 then v_missing := v_missing || ' skip-locked'; end if;
  if position('greatest(coalesce(p_limit, 50), 0)' in v_src) = 0 then v_missing := v_missing || ' batch-bound'; end if;
  if position('expires_at < clock_timestamp()' in v_src) = 0 then v_missing := v_missing || ' own-clock-cutoff'; end if;
  if position('clara._audit(' in v_src) = 0 then v_missing := v_missing || ' audit'; end if;
  if position('pg_notify(''clara_runtime_ctl''' in v_src) = 0 then v_missing := v_missing || ' notify'; end if;
  if position('p_firm is null or firm_id = p_firm' in v_src) = 0 then v_missing := v_missing || ' firm-narrowing'; end if;
  if v_missing <> '' then
    raise exception '#720 prestate: the live clara.expire_due_interruptions is not 0180''s body — missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.5 · the transition allowlist this file depends on. The sweep moves a row pending->expired,
  -- and that is legal ONLY because `clara._tf_interruption_update` says so; a drifted guard would
  -- turn the FIRST swept chat row into a CLR08 at the first live call.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._tf_interruption_update()'::regprocedure;
  if v_src is null or position('pending' in v_src) = 0 or position('expired' in v_src) = 0 then
    raise exception '#720 prestate: clara._tf_interruption_update no longer carries the pending->expired allowlist'
      using errcode='CLR10';
  end if;

  raise notice '#720 prestate: clean — clara.expire_due_interruptions exists exactly once, carries 0180''s body with every arm this file keeps (own-clock cutoff, batch bound, skip-locked, firm narrowing, audit, notify) and is still scoped `work_id is not null`; the interruption transition allowlist still admits pending->expired.';
end
$w720_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §G′ THE RECUT. 0180 §G's body with ONE predicate removed.
--
-- The header 0180 §G carried is reproduced here as the CURRENT law rather than left behind in a
-- file nobody reads at the point of use — with the one paragraph the owner's ruling retires
-- replaced by the ruling itself.
--
-- MEASURED FINDING, not a design preference: `clara.agent_interruptions.expires_at` has carried a
-- 14-day deadline since 0006, `clara.answer_interruption` refuses an answer that arrives after it,
-- and until 0180 nothing ever moved a past-due row to `expired`. 0180 gave the WORK lane its
-- enforcer. The CHAT lane kept the gap: a past-due chat clarification sat `pending` for ever, the
-- parked turn stayed `awaiting_input`, and because a live chat turn holds the session's only
-- live-turn slot (`uq_agent_task_one_live_turn`, 0006:165), EVERY new message in that conversation
-- was refused CLR13 'a turn is already live for this session'. The only escape was a human
-- pressing Stop. That is what this recut ends.
--
-- SCOPED TO PAST-DUE PENDING INTERRUPTIONS, AND NOTHING ELSE. Both lanes, one rule. A swept chat
-- row is delivered as `{kind:'expired'}` by the control listener, which is what the chat turn's
-- parked hook has been typed for since chatTurn_v1: it records a `clarify_closed` part and settles
-- the turn `expired`, releasing the live-turn slot.
--
-- THE CUTOFF IS `clock_timestamp()` AND TAKES NO PARAMETER. A caller-supplied cutoff would let the
-- runtime lane expire questions that are not due, which is a hole no test convenience is worth.
--
-- WHAT THIS RECUT DOES NOT DO (#764, Half 2): it gives the chat lane no `hook_missing` resting
-- state and no reconciler arm. A swept chat row whose engine hook is already gone is still stamped
-- DELIVERED on HookNotFound by the control listener — the pre-0180 assumption, kept deliberately
-- because a chat turn has no reconciler to pick a `hook_missing` row back up, and resting one there
-- would strand it for ever. That asymmetry is the whole of the successor ticket.
-- =====================================================================================
create or replace function clara.expire_due_interruptions(p_limit int default 50, p_firm uuid default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; r record;
begin
  with due as (
    select id from clara.agent_interruptions
     where status = 'pending'
       and expires_at < clock_timestamp()
       and (p_firm is null or firm_id = p_firm)
     order by expires_at
     limit greatest(coalesce(p_limit, 50), 0)
     for update skip locked
  ), moved as (
    update clara.agent_interruptions i set status = 'expired'
      from due where i.id = due.id and i.status = 'pending'
    returning i.id
  )
  select coalesce(array_agg(moved.id), '{}'::uuid[]) into v_ids from moved;

  for r in select i.id, i.firm_id, i.work_id from clara.agent_interruptions i
            where i.id = any (v_ids) loop
    perform clara._audit(r.firm_id, clara.agent_user_id(), null, null,
      'expire_due_interruptions', null,
      jsonb_build_object('question', r.id, 'work', r.work_id));
  end loop;
  if array_length(v_ids, 1) is not null then
    perform pg_notify('clara_runtime_ctl', '');
  end if;
  return jsonb_build_object('expired', coalesce(array_length(v_ids, 1), 0),
    'question_ids', to_jsonb(v_ids));
end $$;
revoke all on function clara.expire_due_interruptions(int,uuid) from public;
grant execute on function clara.expire_due_interruptions(int,uuid) to clara_runtime;

reset role;

-- =====================================================================================
-- §R RELEASE NOTE (for the release session, not executed here).
--
-- BEFORE the recut runtime is allowed its first hosted sweep, count the historical backlog — the
-- rows this file newly admits — and record the number as release evidence:
--
--   select count(*)::int as chat_clarifies_past_due,
--          min(expires_at) as oldest_deadline,
--          count(distinct firm_id)::int as firms_touched
--     from clara.agent_interruptions
--    where status = 'pending' and work_id is null and expires_at < now();
--
-- AFTER the first sweep, the same rows are countable from the audit log, which is the durable
-- witness rather than a before/after subtraction:
--
--   select count(*)::int as chat_rows_expired_by_the_first_sweep
--     from clara.audit_log
--    where fn = 'expire_due_interruptions'
--      and args->>'work' is null
--      and at >= '<the deploy instant>'::timestamptz;
-- =====================================================================================

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w720_tail$
declare v_src text; v_n int; v_posture text; v_missing text;
begin
  -- 1 · still exactly ONE body, at the same signature.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='expire_due_interruptions';
  if v_n <> 1 then
    raise exception '#720 tail: clara.expire_due_interruptions now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.expire_due_interruptions(integer,uuid)') is null then
    raise exception '#720 tail: clara.expire_due_interruptions(integer,uuid) no longer resolves' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.expire_due_interruptions(integer,uuid)'::regprocedure;

  -- 2 · THE SCOPING IS GONE. The literal probe this whole file exists for.
  if position('work_id is not null' in v_src) <> 0 then
    raise exception '#720 tail: the committed body STILL carries `work_id is not null` -- the chat lane has no enforcer'
      using errcode='CLR10';
  end if;
  -- …and the ONLY surviving mentions of work_id are the audit projection's two qualified reads
  -- (`i.work_id` in the select list, `r.work_id` in the payload). Strip those two and NOTHING of
  -- the name may remain — a literal probe, not a count, so a THIRD mention is a failure too.
  if position('work_id' in replace(replace(v_src, 'i.work_id', ''), 'r.work_id', '')) <> 0 then
    raise exception '#720 tail: the committed body mentions work_id somewhere other than the audit projection'
      using errcode='CLR10';
  end if;
  if position('status = ''pending''' in v_src) = 0 then
    raise exception '#720 tail: the committed body no longer selects pending rows' using errcode='CLR10';
  end if;

  -- 3 · EVERY OTHER ARM SURVIVED, arm by arm, against the committed text.
  v_missing := '';
  if position('expires_at < clock_timestamp()' in v_src) = 0 then v_missing := v_missing || ' own-clock-cutoff'; end if;
  if position('greatest(coalesce(p_limit, 50), 0)' in v_src) = 0 then v_missing := v_missing || ' batch-bound'; end if;
  if position('order by expires_at' in v_src) = 0 then v_missing := v_missing || ' oldest-first'; end if;
  if position('for update skip locked' in v_src) = 0 then v_missing := v_missing || ' skip-locked'; end if;
  if position('p_firm is null or firm_id = p_firm' in v_src) = 0 then v_missing := v_missing || ' firm-narrowing'; end if;
  if position('i.status = ''pending''' in v_src) = 0 then v_missing := v_missing || ' update-reguard'; end if;
  if position('''expire_due_interruptions''' in v_src) = 0 then v_missing := v_missing || ' audit-label'; end if;
  if position('jsonb_build_object(''question'', r.id, ''work'', r.work_id)' in v_src) = 0 then v_missing := v_missing || ' audit-payload'; end if;
  if position('pg_notify(''clara_runtime_ctl'', '''')' in v_src) = 0 then v_missing := v_missing || ' notify'; end if;
  if position('array_length(v_ids, 1) is not null' in v_src) = 0 then v_missing := v_missing || ' notify-only-when-nonempty'; end if;
  if position('''expired'', coalesce(array_length(v_ids, 1), 0)' in v_src) = 0 then v_missing := v_missing || ' return-expired'; end if;
  if position('''question_ids'', to_jsonb(v_ids)' in v_src) = 0 then v_missing := v_missing || ' return-question-ids'; end if;
  if v_missing <> '' then
    raise exception '#720 tail: the recut LOST arm(s):% -- only the work_id scoping may leave', v_missing
      using errcode='CLR10';
  end if;

  -- 4 · POSTURE, read from the catalog rather than from this file's own text: owner, SECURITY
  -- DEFINER, pinned search_path, and the EXACT ACL (grantor included) -- runtime and nobody else.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.expire_due_interruptions(integer,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#720 tail: the verb has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE to clara_runtime only; got {%}', v_posture
      using errcode='CLR10';
  end if;

  raise notice '#720 tail: OK -- clara.expire_due_interruptions exists exactly once at (integer,uuid), owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned and EXECUTE-reachable by clara_runtime and nobody else (PUBLIC revoked, no agent/wake/authenticated grant); its scoping predicate `work_id is not null` is GONE and the only surviving mention of work_id is the audit payload''s projection, so a past-due CHAT clarification is now swept under exactly the rules a past-due Work question is; and every other arm 0180 shipped is re-measured present in the committed text -- the parameterless clock_timestamp() cutoff, the oldest-first order, the greatest(coalesce(p_limit,50),0) batch bound, `for update skip locked`, the optional p_firm narrowing, the re-guarded pending->expired UPDATE, one clara._audit row per swept row carrying {question, work} with work recorded as jsonb null for a chat row, ONE pg_notify per non-empty sweep, and the {expired, question_ids} return shape. Work-question expiry is unchanged in behaviour. The chat lane''s HookNotFound asymmetry is untouched and belongs to #764.';
end
$w720_tail$;
