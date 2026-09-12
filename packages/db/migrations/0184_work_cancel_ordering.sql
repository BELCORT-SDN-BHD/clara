-- 0184_work_cancel_ordering — #630 (refresh spec #612, Implementation Decisions §2 and §5;
-- journeys B3, B7, C3): SETTLING ADMITTED OPERATIONS UNDER CANCEL, REVOCATION AND LOCK-PERIOD
-- RACES.
-- =====================================================================================
-- Spec of record: issue #612 §5 — "A shared database ordering boundary decides admission versus
-- cancellation/current-authority changes. After cancellation wins, admit no new business action.
-- Previously admitted atomic work settles, completed receipts remain, and UI shows stopping until
-- the final boundary is known. Revocation after commit cannot erase the effect or permit replay
-- under lost read access." Ticket #630. Domain words: CONTEXT.md — "Accounting work",
-- "Operation receipt", "Work cancellation". Builds on 0178 (the accounting-work lane), 0180 (the
-- authority snapshot) and 0182 (the current posting core); touches nothing 0179 or 0181 created.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.accounting_work`'s own ROW LOCK becomes THE
-- ordering boundary between admitting a journal operation and cancelling the Work that authorised
-- it, so exactly one of the two wins, the loser creates no effect and returns a typed refusal, and
-- a Work whose run is still settling reads `stopping` rather than a terminal that is not yet true.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES EVERYTHING BELOW: THE POSTING CORE NEVER ASKED.
--
-- `clara._record_journal_entry_core` (0178:1223, recut at 0182:763) reads its Work row WITHOUT a
-- lock and never looks at `accounting_work.status` or at the current task's status. So a Work a
-- human had already cancelled could still post: `clara.cancel_agent_task` writes
-- `agent_tasks.status='cancel_requested'` and returns, the engine abort is asynchronous, and the
-- tool call already in flight commits an approved journal entry and a committed operation receipt
-- into a Work the operator's screen says is stopping. Nothing in the estate refused it, because
-- nothing in the estate had been asked.
--
-- The fix is ONE LOCK, not a status column comparison bolted on at four call sites. `for update`
-- on the Work row inside the posting transaction makes admission and cancellation SERIALISE:
--
--   · a cancel that arrives while the core holds the lock WAITS until the entry and the receipt
--     commit, and then sees the receipt — so it answers `already_completed` and settles the Work
--     `completed`. Money in the ledger is never reported as cancelled.
--   · a post that arrives while the cancel holds the lock WAITS until the cancel commits, and then
--     reads `status in ('stopping','cancelled')` — so it refuses CLR13 `work_cancelled` BEFORE
--     `clara._reserve_op`, leaving the logical identity unspent and the books untouched.
--
-- THE GLOBAL LOCK ORDER FOR THIS LANE IS THEREFORE: **accounting_work → agent_tasks →
-- agent_interruptions**, and every writer in this file takes it that way:
--
--   clara.cancel_accounting_work      work FOR UPDATE, then the task FOR UPDATE, then its questions
--   clara.take_over_accounting_work   work FOR UPDATE, then (through retry) the task
--   clara.cancel_agent_task           work FOR UPDATE first for an accounting_work task -- RECUT
--                                     in §H2; every other kind is byte-for-byte 0133's.
--   clara.open_work_question          work FOR NO KEY UPDATE first -- RECUT in §H2; 0180 took it
--                                     AFTER the task transition, which is the inverse.
--   clara._record_journal_entry_core  work FOR UPDATE (the task is only FK-referenced)
--   clara.settle_work_run             work FOR UPDATE first — RECUT HERE for exactly this reason:
--                                     it used to update `agent_tasks` and THEN
--                                     `clara.accounting_work`, i.e. task → work, which is the
--                                     inverse of the boundary and a deadlock against every cancel.
--   clara.claim_work_run              work FOR UPDATE first — recut for the same reason.
--
-- AND IT IS GLOBAL, NOT LOCAL TO THIS FILE'S OWN WRITERS. An earlier cut left two older doors
-- taking the TASK first and reaching `clara.accounting_work` afterwards — `clara.cancel_agent_task`
-- (0133:567) through the recut status mirror, and `clara.open_work_question` (0180:630) through its
-- own second lock — and argued the resulting cycle was a transient both callers absorb. MEASURED,
-- and it is not: a human's /activity cancel racing a Work-level cancel of the same Work raised
-- 40P01 on three probes, the Work-level side lost twice, and NOTHING on the route or in the web
-- retries it (`grep -rn 40P01 apps/web packages/runtime/src packages/runtime/lib` was empty) — so
-- the human got HTTP 500 and nothing had happened. `clara.open_work_question` produces the same
-- cycle with no second human at all: a run parks on a question exactly as its Work is cancelled.
--
-- §H2 therefore RECUTS BOTH with their full bodies to take the Work row first, guarded on the
-- task's own `kind` so every other kind takes the path it always took and nothing becomes dependent
-- on a relation that might be absent (`clara.accounting_work` exists from 0178, i.e. before this
-- file can apply). `create or replace` with a full body respects the append-only law: no older
-- migration is edited. The route additionally maps 40P01/40001 to a typed transient conflict —
-- defence in depth behind a fixed order, not instead of it.
--
-- =====================================================================================
-- THE ACTIVITY FEED'S TWO PROJECTIONS ARE RECUT IN §I2 BELOW, FROM 0183's BODIES.
--
-- §A splits `clara.accounting_work.initiator` (now: the human the Work is executed AS) from
-- `initiated_by` (who asked), and §I registers `work.taken_over`, the estate's FIRST `work.%`
-- event type. Two doors 0181 created read the old meaning:
--
--   1. `clara.get_activity_event` projects `'initiator', w.initiator` in its operation_receipt
--      arm, and the Activity sheet renders it. After a takeover that names the COLLEAGUE, beside
--      an `on_behalf_of` that is also the colleague — and who asked is then absent from the
--      firm's only firm-wide history surface. It must also project `initiated_by`.
--   2. `clara.list_activity` and `clara.get_activity_event` map an event type to a closed kind
--      set with `when like 'entry.%' … else 'documents'`, so a `work.%` handover lands in the
--      `documents` bucket and is invisible under the `work` filter.
--
-- THE RECUT WAITED FOR 0183. Lane #728's migration recuts the same two functions in the same
-- session, and two lanes emitting two full bodies of one function is a merge that resolves itself
-- wrongly and silently. §I2 below is therefore derived from 0183's INSTALLED text — sha-pinned in
-- the prestate block, the way 0183 pinned 0181's — and adds nothing else to it.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: THE CLOSURE'S ERROR ROSTER IS DEPLOY-LOCKED, SO THE TRANSLATION IS THE
-- DATABASE'S.
--
-- `claraWork.v1.errors.ts` and `claraWork.v2.errors.ts` are `@frozen` and `deployed: true`
-- (frozen-workflows.json). v1 classifies an unrecognised CLR13 as `state_changed`, and
-- `workOutcomeFor('state_changed')` is `failed`; v2 overrides exactly one pair
-- (`CLR13`/`source_conflict`) and may not gain another. So a run refused `work_cancelled` at the
-- boundary asks to settle `failed`, and a run whose ENGINE was aborted asks to settle `cancelled`
-- (its own `clara_work_cancelled` tag). Two different requests, ONE true terminal.
--
-- `clara.settle_work_run` therefore TRANSLATES on the database side: when the task is
-- `cancel_requested` and no committed receipt exists, the Work terminal is `cancelled` whatever
-- outcome the run asked for, and the request is preserved verbatim under
-- `error.superseded = {outcome, error_code, error}` so nothing the run believed is lost. The
-- returned object says `translated_by_cancel: true`, for the same reason the receipt override says
-- `overridden_by_receipt`: silently answering something other than what was asked is how the
-- estate loses a fact. A committed receipt still outranks BOTH (0178's law, unchanged).
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: THE COLUMN A TAKEOVER MUST MOVE IS `initiator`, AND NOTHING ELSE WILL DO.
--
-- Story 29 asks that a currently authorised colleague be able to take responsibility for a Work
-- whose person lost authority. The obvious design is a NEW column and an immutable `initiator`. It
-- does not work, and the reason is measured rather than stylistic: the DEPLOY-LOCKED closure mints
-- every credential this lane uses OBO `clara.accounting_work.initiator` (claraWork.v2.impl.ts:184
-- reading claraWork.v1.impl.ts:142's own SELECT, spent at claraWork.v1.tools.ts:199/210). A takeover
-- that moved a different column would be RECORDED and then fail on the taken-over run's first tool
-- call — measured on the rig, with `clara.mint_wake_credential` refusing "on_behalf_of must be an
-- active bookkeeper+ of the firm" and the Work settling `failed` about the chart.
--
-- So §A splits the two facts `initiator` was carrying: it keeps the NAME and becomes the human the
-- Work is executed AS, and the immutable historical fact moves to `initiated_by`. The refusal reason
-- for a mismatched credential stays `obo_not_initiator` — the frozen roster knows that token and a
-- rename would make the run classify its own refusal as unmapped.
-- =====================================================================================

do $w630_pre$
declare v_n int; v_src text;
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception '#630 prestate: clara.accounting_work is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.cancel_accounting_work(uuid,uuid,text)') is not null
     or to_regprocedure('clara.take_over_accounting_work(uuid,uuid,text,text)') is not null then
    raise exception '#630 prestate: a work-cancel door already exists' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work' and column_name='initiated_by';
  if v_n <> 0 then
    raise exception '#630 prestate: clara.accounting_work.initiated_by already exists' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  if position('initiated_by' in v_src) > 0
     or position('''purpose'',''initiator'',''initiator_role''' in v_src) = 0 then
    raise exception '#630 prestate: the immutability trigger is not 0178''s -- re-derive its recut'
      using errcode='CLR10';
  end if;
  -- The posting core reads its Work WITHOUT a lock and asks nothing about its status. That is the
  -- gap this file closes; pinned so a later reader can see the before-state was real.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('for update' in v_src) > 0 then
    raise exception '#630 prestate: the posting core ALREADY takes a row lock -- re-derive this file'
      using errcode='CLR10';
  end if;
  if position('work_cancelled' in v_src) > 0 then
    raise exception '#630 prestate: the posting core already knows about cancellation' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_accounting_work_status_mirror()'::regprocedure;
  if position('stopping' in v_src) > 0 then
    raise exception '#630 prestate: the status mirror already writes stopping' using errcode='CLR10';
  end if;
  -- THE TWO LIVE BODIES §I2 RECUTS, pinned by prosrc sha-256 at the 0183 frontier — the same
  -- discipline 0183 applied to 0181's two bodies, for the same reason: §I2 is a FULL-BODY rewrite
  -- of these exact texts plus two marked arms, and a drifted body may carry an arm this file would
  -- delete without ever having read it. A drift is REFUSED, never silently overwritten.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_src is distinct from 'd7b6e9e3a48a2723bc6d80bb5d467d43bf9ccfeffe8dc24de876c0827762dd4e' then
    raise exception '#630 prestate: clara.list_activity has DRIFTED from the pinned 0183 body (sha %) -- re-derive section I2 against the live body before applying', v_src
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_src is distinct from 'ebcc569f634dba2fef9339c14b88ac84d83fa9172ac374c27a8bb5d419facdee' then
    raise exception '#630 prestate: clara.get_activity_event has DRIFTED from the pinned 0183 body (sha %) -- re-derive section I2 against the live body before applying', v_src
      using errcode='CLR10';
  end if;
  raise notice '#630 prestate: clean -- no work-level cancel or takeover door exists, accounting_work has no initiated_by column and its immutability trigger still freezes initiator, the posting core takes no row lock and knows no cancellation, and the status mirror never writes stopping.';
end
$w630_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A0  THREE PRIVATE HELPERS THE REST OF THE FILE IS WRITTEN IN TERMS OF.
--
-- Each one exists because a fact was about to be written down more than once, and a fact written
-- twice is a fact that drifts. None is granted to anybody: every caller below is SECURITY DEFINER
-- and runs as this file's owner.
-- =====================================================================================

-- (1) THE CANCELLATION'S OWN WORDS, IN ONE PLACE. `clara.settle_work_run`'s translation arm, both
-- terminal arms of `clara.cancel_accounting_work` and `clara._tf_accounting_work_status_mirror`
-- all describe the SAME event -- a Work stopped before it recorded anything -- and a copy-edit
-- applied to three of four literals is how one event comes to have two sentences. The runtime's
-- `cancelSettleForWork` (reconciler-work.mjs) carries the JS twin, and
-- `packages/db/tests/work-cancel.test.mjs` pins the two against each other so the claim that they
-- are byte-identical is CHECKED rather than asserted in a comment.
create function clara._work_cancelled_error() returns jsonb
  language sql immutable set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'code', 'cancelled', 'reason', 'cancelled',
    'message', 'This Work was cancelled before an entry was recorded. Nothing was posted.',
    'recoverable', true)
$$;
revoke all on function clara._work_cancelled_error() from public;
comment on function clara._work_cancelled_error() is
  '#630: the one error object a Work cancelled with nothing posted carries. Single source of truth '
  'for every SQL writer of that fact; the runtime twin lives in reconciler-work.mjs and the two are '
  'pinned equal by the db battery.';

-- (2) THE WORK-LANE DOOR PREAMBLE. `clara.cancel_accounting_work` and
-- `clara.take_over_accounting_work` open the same way -- find the Work, answer a non-member and an
-- absent Work identically, demand an ACTIVE bookkeeper+ re-read at the door, and reserve the op
-- key with a TYPED re-raise of `_reserve_op`'s untyped conflict. `clara.retry_accounting_work`
-- (0178) already carried a third copy of the same shape without the typed re-raise. Writing it once
-- means the bookkeeper floor is ONE line to change when the rule changes, rather than three places
-- to remember.
--
-- The two message words that differ ride in as parameters, so every refusal this helper raises is
-- byte-identical to the one its caller used to raise itself: `p_noun` is 'cancel' / 'takeover' and
-- `p_gerund` is 'cancelling' / 'taking responsibility for'.
--
-- IT TAKES NO LOCK. The boundary belongs to the caller, which takes `clara.accounting_work FOR
-- UPDATE` immediately after this returns -- the lane's global order is not something a preamble
-- gets to decide.
create function clara._work_door_ctx(p_work uuid, p_author uuid, p_op_key text,
    p_door text, p_noun text, p_gerund text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_role text; v_member_status text; v_dedupe jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a % requires its idempotency key', p_noun using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select aw.firm_id into v_firm from clara.accounting_work aw where aw.id = p_work;
  if v_firm is null then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  -- NO EXISTENCE ORACLE: a non-member and an absent Work answer identically.
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception '% accounting work requires a bookkeeper or above', p_gerund
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(v_firm, p_door, p_op_key,
      clara._hash(jsonb_build_object('work', p_work, 'author', p_author)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args", re-raised WITH a detail so
    -- every refusal these doors emit carries (errcode, detail.reason) -- the answer_work_question
    -- precedent (0180).
    raise exception 'this op key was already used for a different %', p_noun using errcode='CLR10',
      detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null and v_dedupe ? 'pending' then
    raise exception 'this % key is held by an in-flight sibling', p_noun using errcode='CLR13',
      detail='{"reason":"operation_in_flight"}';
  end if;
  return jsonb_build_object('firm', v_firm, 'role', v_role)
       || case when v_dedupe is null then '{}'::jsonb
               else jsonb_build_object('dedupe', v_dedupe) end;
end $$;
revoke all on function clara._work_door_ctx(uuid,uuid,text,text,text,text) from public;
comment on function clara._work_door_ctx(uuid,uuid,text,text,text,text) is
  '#630: the shared preamble of the Work-lane human doors -- no existence oracle, an ACTIVE '
  'bookkeeper+ re-read at the door, and a typed op-key reservation. Takes no lock: the ordering '
  'boundary is the caller''s to take.';

-- (3) THE STRANDED-WORK BELT. A TERMINAL RUN UNDER A NON-TERMINAL WORK IS A BROKEN PAIR.
--
-- MEASURED, not hypothetical: `clara.cancel_agent_task` (0133) terminalises a QUEUED
-- accounting_work task itself and knows nothing about `clara.accounting_work`, so before this file
-- the pair (Work `queued`, task `cancelled`) was reachable from the /activity panel in one click
-- -- and the Work was then uncancellable (the cancel door's live-run arm asks for a transition
-- `clara._tf_agent_task_update` refuses), unretryable (`clara.retry_accounting_work` wants a
-- terminal Work) and unreconciled (the sweep looks at `queued`/`running`/`awaiting_input` tasks).
-- A Work with no way out is the worst answer the estate can give.
--
-- Three belts close it. TWO of them land here — the cancel door converges before it decides (§G)
-- and the runtime's reconciler converges what it finds (reconciler-work.mjs §A2, through
-- `clara.settle_work_run`'s replay arm) — so the receipt law those two apply is written once.
--
-- THE THIRD, THE STATUS MIRROR (§B), DELIBERATELY DOES NOT, and an earlier header claiming it did
-- was wrong (review). The mirror is a TRIGGER on `clara.agent_tasks`: it has no task id to pass
-- (it is `new.id`, but the transition it is reacting to is the only one it may speak for), it runs
-- INSIDE `clara.settle_work_run`'s own transaction on every terminal settle, and its job is
-- narrower — it writes `completed` on a receipt and `cancelled` on a cancelled run with none, and
-- leaves every other terminal to the settle verb that is about to write it properly. Routing it
-- through this helper would have it converge and AUDIT a Work one statement before the verb writes
-- the real answer, i.e. two audit rows and one wrong intermediate for every settle in the lane.
-- What the two DO share is the cancellation's own words: both reach for
-- `clara._work_cancelled_error()` (§A0(1)), and `work-cancel.test.mjs` wc.30 pins every writer's
-- CALL SITE rather than only the values, so "one source" is a checked claim.
-- Returns the Work status it wrote, or null when there was nothing to converge.
create function clara._converge_work_terminal(p_work uuid, p_task uuid, p_task_status text)
  returns text
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_receipt jsonb; v_status text; v_current text; v_task uuid;
begin
  select w.status, w.current_task_id into v_current, v_task
    from clara.accounting_work w where w.id = p_work for update;
  if v_current is null then return null; end if;
  -- A RUN SPEAKS ONLY FOR THE WORK IT IS STILL ON. `clara.retry_accounting_work` (0178) leaves the
  -- OLD run terminal and points `current_task_id` at a NEW one, so a LATE report about the old run
  -- -- a durable settle step re-executing after an uncheckpointed crash (`settleWorkStep` is a
  -- `"use step"`, and the respawn-before-checkpoint shape is MEASURED on the rig), an operator
  -- replay, a sweep row read before the retry -- describes a run this Work has moved on from.
  -- Converging from it would write a terminal over a live run, cancel the NEW run's pending
  -- question, and leave the posting core refusing that run for ever (CLR13 `work_settled`): the
  -- stranded pair this helper exists to repair, created by the repair itself. Nothing is written
  -- and the caller is told so; the run it asked about keeps its own terminal, which is true.
  if v_task is distinct from p_task then return null; end if;
  if v_current in ('completed','refused','failed','cancelled','expired') then return null; end if;
  if p_task_status is null or p_task_status not in ('completed','failed','cancelled','expired') then
    return null;
  end if;
  -- THE BOOKS FIRST, ALWAYS. A Work that recorded an effect is `completed` whatever its run's
  -- terminal says (0178's law, and ARCHITECTURE §6's "取消不冲销已入账结果").
  v_receipt := clara._work_committed_receipt(p_work);
  if v_receipt is not null then
    update clara.accounting_work
       set status = 'completed', error = null,
           result = coalesce(result, '{}'::jsonb) || v_receipt
     where id = p_work;
    v_status := 'completed';
  else
    v_status := case p_task_status when 'completed' then 'completed'
                                   when 'expired'   then 'expired'
                                   when 'cancelled' then 'cancelled'
                                   else 'failed' end;
    update clara.accounting_work
       set status = v_status,
           error = case
             when v_status = 'completed' then null
             when v_status = 'cancelled' then clara._work_cancelled_error()
             else jsonb_build_object('code','engine_lost','reason','run_ended_without_settling',
                    'message','This Work''s run ended without settling. Nothing was posted.',
                    'recoverable', true) end
     where id = p_work;
  end if;
  -- THE PENDING QUESTION DIES WITH THE RUN (S4-D6), exactly as clara.settle_work_run does it.
  if v_task is not null then
    update clara.agent_interruptions set status = 'cancelled'
     where task_id = v_task and status = 'pending';
  end if;
  perform clara._audit((select w.firm_id from clara.accounting_work w where w.id = p_work),
    clara.agent_user_id(), null, null, 'converge_work_terminal', null,
    jsonb_build_object('work', p_work, 'task', v_task, 'task_status', p_task_status,
      'from_status', v_current, 'status', v_status,
      'by_receipt', (v_receipt is not null)));
  return v_status;
end $$;
revoke all on function clara._converge_work_terminal(uuid,uuid,text) from public;
comment on function clara._converge_work_terminal(uuid,uuid,text) is
  '#630: converge a NON-terminal Work whose CURRENT run has already ended. Receipt first '
  '(completed), then the run''s own terminal. Takes the run it is reporting about and writes '
  'nothing when that run is no longer the Work''s: a retry or a takeover must survive a late '
  'settle. The one place the receipt law is written for the stranded-pair belts in the mirror, the '
  'cancel door and the runtime reconciler.';

-- =====================================================================================
-- §A  WHO THE WORK RUNS AS, AND WHO ASKED FOR IT — two facts that were one column.
--
-- Story 29 asks that a currently authorised colleague be able to take responsibility for a Work
-- whose person lost authority. THE MEASUREMENT THAT DECIDES THE SHAPE: the deploy-locked closure
-- mints EVERY credential this lane uses OBO `clara.accounting_work.initiator` —
-- `claraWork.v2.impl.ts:184` sets `createdBy: work.initiator` from `loadWorkStep`'s own
-- `select ... w.initiator ... from clara.accounting_work w` (claraWork.v1.impl.ts:142), and
-- `claraWork.v1.tools.ts:199/210` mint `interactive_client` / `interactive` OBO exactly that value.
-- Both files are `@frozen` and `deployed: true` in frozen-workflows.json.
--
-- So a takeover that moved a NEW column would be recorded and then FAIL. Measured on the rig
-- (tests/work-cancel-e2e.mjs leg 5, first cut): the taken-over run's very first tool call
-- (`list_accounts`) died inside `clara.mint_wake_credential` with "on_behalf_of must be an active
-- bookkeeper+ of the firm", and the Work settled `failed` saying the chart could not be read. The
-- column the run acts as IS `initiator`, and there is no way to tell the deployed closure otherwise.
--
-- THE SPLIT, THEREFORE: `initiator` keeps its NAME and its every existing reader, and becomes the
-- human whose LIVE AUTHORITY this Work is executed under — the admitting human until exactly one
-- door moves it. The historical fact it used to also carry moves to its own immutable column,
-- `initiated_by`, so nothing is lost: who asked is still frozen forever, it is simply no longer the
-- same question as who is answerable now.
-- =====================================================================================
alter table clara.accounting_work add column initiated_by uuid references clara.users(id);
-- The backfill runs with the immutability trigger DISABLED for one statement. Not to dodge its
-- check (nothing frozen moves) but to keep `updated_at` HONEST: that trigger stamps
-- `new.updated_at := now()` on every update, and a schema backfill is not a thing that happened to
-- the Work. Re-enabled immediately; both statements are inside this migration's single transaction.
alter table clara.accounting_work disable trigger t_accounting_work_immutable;
update clara.accounting_work set initiated_by = initiator where initiated_by is null;
alter table clara.accounting_work enable trigger t_accounting_work_immutable;
alter table clara.accounting_work alter column initiated_by set not null;

comment on column clara.accounting_work.initiated_by is
  '#630: the human who ADMITTED this Work. Immutable forever — the estate''s record of who asked, '
  'read off the posted entry by a reviewer months later. `initiator` is the human the Work is '
  'currently executed AS, and clara.take_over_accounting_work is the only door that moves it.';
comment on column clara.accounting_work.initiator is
  '#630 (was #623): the human whose LIVE AUTHORITY this Work spends — the credential every run of '
  'it is minted on behalf of, and the `on_behalf_of` of its receipt. Equal to `initiated_by` until '
  'clara.take_over_accounting_work moves it. `initiator_role` remains the ADMISSION snapshot and '
  'therefore describes `initiated_by`.';

-- The default. A column DEFAULT cannot read another column, and recutting
-- `clara.admit_journal_work` purely to add one assignment would put a 160-line body under review for
-- a line that belongs to the table. A BEFORE INSERT trigger states the invariant once, for every
-- writer that will ever exist. It reads NO clock.
create function clara._tf_accounting_work_initiated_by_default() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.initiated_by is null then new.initiated_by := new.initiator; end if;
  return new;
end $$;
revoke all on function clara._tf_accounting_work_initiated_by_default() from public;
create trigger t_accounting_work_initiated_by_default before insert on clara.accounting_work
  for each row execute function clara._tf_accounting_work_initiated_by_default();

-- -------------------------------------------------------------------------------------
-- clara._tf_accounting_work_immutable — RECUT. Full 0178 body; TWO changes, both marked.
--
--   1. `initiated_by` JOINS the frozen set and `initiator` LEAVES it. The set does not shrink: the
--      immutable historical fact is still frozen, under the column that now holds it.
--   2. A MOVE OF `initiator` IS NOT FREE. It is admitted only towards an ACTIVE bookkeeper+ of the
--      Work's own firm — because the whole point of moving it is that the run will spend that
--      human's authority, and a column that could be pointed at anybody would be a way to launder a
--      posting through a member who never agreed to it. The door checks this too; the trigger is the
--      belt, and it is what makes the claim a property of the DATA rather than of one verb.
-- -------------------------------------------------------------------------------------
create or replace function clara._tf_accounting_work_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_frozen text[] := array['id','firm_id','client_id','purpose','initiated_by','initiator_role',
                           'intent_key','logical_op_id','basis','basis_digest','basis_origin',
                           'created_at'];
  c text; v_role text; v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'accounting work is never deleted (settle it, do not erase it)'
      using errcode='CLR08', detail='{"reason":"accounting_work_immutable","column":"*"}';
  end if;
  foreach c in array v_frozen loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'accounting work column % is immutable after admission', c
        using errcode='CLR08',
          detail=jsonb_build_object('reason','accounting_work_immutable','column',c)::text;
    end if;
  end loop;
  -- #630 · the ONE mutable authority column, and its wall.
  if new.initiator is distinct from old.initiator then
    select m.role, m.status into v_role, v_status from clara.firm_memberships m
     where m.user_id = new.initiator and m.firm_id = new.firm_id
     order by (m.status = 'active') desc, m.created_at desc limit 1;
    if v_role is null or v_status <> 'active'
       or clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
      raise exception 'accounting work may only be handed to an active bookkeeper of its own firm'
        using errcode='CLR04',
          detail=jsonb_build_object('reason','responsible_not_authorised','column','initiator')::text;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function clara._tf_accounting_work_immutable() from public;

-- =====================================================================================
-- §B  clara._tf_accounting_work_status_mirror — RECUT. Full 0178 body; the addition is marked.
--
-- The mirror exists so the estate's own parking and cancel doors keep the Work honest WITHOUT
-- BEING EDITED. 0178 mirrored the two non-terminal transitions (`running`, `awaiting_input`) and
-- one receipt-aware terminal arm. `cancel_requested` fell between them: it is not terminal, so the
-- terminal arm returned early, and it was not in the non-terminal list either — which is why
-- `stopping` was declared by 0178's CHECK and never written by anything in the estate.
-- =====================================================================================
create or replace function clara._tf_accounting_work_status_mirror() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_receipt jsonb;
begin
  if new.work_id is null then return null; end if;
  if new.status in ('running', 'awaiting_input') then
    update clara.accounting_work w
       set status = new.status
     where w.id = new.work_id
       and w.status is distinct from new.status
       -- A Work that already settled is never re-opened by a late task transition.
       and w.status not in ('completed','refused','failed','cancelled','expired');
    return null;
  end if;
  -- #630 · THE STOPPING ARM. A run that has been asked to abort is neither live nor finished, and
  -- `stopping` is the one word for that: admitted work may still be settling, so the Work must not
  -- show a terminal that is not yet true (spec §5, and Appendix C's B7 row "admitted operations may
  -- be settling, shown as 正在停止"). A Work that already settled is never re-opened, and a Work
  -- that already holds a committed receipt reaches `completed` through clara.settle_work_run —
  -- passing through `stopping` for the instant between the abort request and the settle is exactly
  -- what the word means.
  if new.status = 'cancel_requested' then
    -- …AND `stopping` IS NOT SAID OVER A WORK WHOSE BOUNDARY IS ALREADY KNOWN. A Work that holds a
    -- committed receipt has WON the race: the entry is on the books, the abort request is about
    -- the RUN (the model must stop spending), and telling a human "stopping" about a posting that
    -- already happened is precisely the "no hidden effect" failure this lane exists to prevent.
    -- The receipt law is the same one the terminal arm below applies, and it outranks every task
    -- status in both directions.
    v_receipt := clara._work_committed_receipt(new.work_id);
    if v_receipt is not null then
      update clara.accounting_work w
         set status = 'completed', error = null,
             result = coalesce(w.result, '{}'::jsonb) || v_receipt
       where w.id = new.work_id
         and w.status not in ('completed','refused','failed','cancelled','expired');
      return null;
    end if;
    update clara.accounting_work w
       set status = 'stopping'
     where w.id = new.work_id
       and w.status is distinct from 'stopping'
       and w.status not in ('completed','refused','failed','cancelled','expired');
    return null;
  end if;
  -- THE TERMINAL ARM IS RECEIPT-AWARE, AND IT IS THE ONLY TERMINAL STATE THIS MIRROR WRITES.
  -- A terminal task status is normally clara.settle_work_run's to translate, because the Work's
  -- vocabulary is richer than the task's -- and that is still true for every Work that posted
  -- nothing. But `clara.cancel_agent_task` (0006/0133, and deliberately NOT edited) terminalises a
  -- QUEUED accounting_work task itself, with no settle in sight. Nothing in the estate requires a
  -- run to have CLAIMED before it posts -- `_record_journal_entry_core` attributes the receipt to
  -- `w.current_task_id` when the credential binds no task -- so a Work could hold an approved entry
  -- and a committed receipt while its task was still `queued`, and one human cancel then stranded
  -- it at `queued` FOREVER with money in the ledger and no terminal state on the row. This arm
  -- answers that without touching the estate's cancel door: a committed receipt makes the Work
  -- `completed`, whatever the task's terminal status says, and never the reverse -- a terminal task
  -- with NO receipt still falls through to settle_work_run untouched.
  if new.status not in ('completed','failed','cancelled','expired') then return null; end if;
  v_receipt := clara._work_committed_receipt(new.work_id);
  if v_receipt is null then
    -- #630 · AND THE OTHER HALF OF THE SAME SENTENCE: a run CANCELLED with nothing on the books
    -- terminalises its Work too. This is the same `clara.cancel_agent_task` path, one click from
    -- the /activity panel, in the case where no entry was posted: before this arm the task read
    -- `cancelled` and the Work stayed `queued` FOREVER -- uncancellable (the Work door's live-run
    -- arm asks for a transition the task matrix refuses), unretryable (Retry wants a terminal
    -- Work) and unreconciled. The word the Work reaches is the run's own, and the error is the
    -- lane's single source of truth for it.
    if new.status = 'cancelled' then
      update clara.accounting_work w
         set status = 'cancelled', error = clara._work_cancelled_error()
       where w.id = new.work_id
         and w.status not in ('completed','refused','failed','cancelled','expired');
    end if;
    return null;
  end if;
  update clara.accounting_work w
     set status = 'completed', error = null,
         result = coalesce(w.result, '{}'::jsonb) || v_receipt
   where w.id = new.work_id and w.status is distinct from 'completed';
  return null;
end $$;
revoke all on function clara._tf_accounting_work_status_mirror() from public;

-- =====================================================================================
-- §C  clara.claim_work_run — RECUT. Full 0178 body; the addition is ONE statement.
--
-- The claim used to write `agent_tasks` and THEN `clara.accounting_work` — task → work, the
-- inverse of this file's boundary. A cancel holding the Work row while the claim holds the task row
-- is a deadlock cycle, and a cancel arriving in the instant a queued Work is claimed is not an
-- exotic race: it is exactly what a human pressing Cancel on a just-submitted Work produces.
-- =====================================================================================
create or replace function clara.claim_work_run(p_task uuid, p_workflow_run_id text, p_bundle jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_upd int; v_claimed boolean; v_status text;
begin
  if p_workflow_run_id is null or p_workflow_run_id ~ '^\s*$' then
    raise exception 'a run claim requires its workflow run id' using errcode='CLR10',
      detail='{"reason":"invalid_run_id","constraint":"nonempty"}';
  end if;
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or nullif(btrim(coalesce(p_bundle->>'digest','')),'') is null
     or nullif(btrim(coalesce(p_bundle->>'id','')),'') is null then
    -- C88.8: a run that cannot state WHICH bundle is serving it may not claim work at all.
    raise exception 'a run claim must name its serving bundle (id + digest)' using errcode='CLR10',
      detail='{"reason":"invalid_bundle","constraint":"id+digest"}';
  end if;
  select * into t from clara.agent_tasks at where at.id = p_task;
  if not found then
    raise exception 'task not found' using errcode='CLR11', detail='{"reason":"task_not_found"}';
  end if;
  if t.kind <> 'accounting_work' then
    raise exception 'claim_work_run is for accounting-work runs only (got kind %)', t.kind
      using errcode='CLR10', detail=jsonb_build_object('reason','wrong_task_kind','kind',t.kind)::text;
  end if;
  -- #630 · THE BOUNDARY, TAKEN FIRST. See this file's header: every writer in this lane locks
  -- accounting_work before agent_tasks, so a cancel and a claim can never hold each other's row.
  perform 1 from clara.accounting_work w where w.id = t.work_id for update;

  update clara.agent_tasks
     set status = 'running', workflow_run_id = p_workflow_run_id, updated_at = now()
   where id = p_task and status = 'queued' and workflow_run_id is null;
  get diagnostics v_upd = row_count;
  if v_upd = 1 then
    v_claimed := true;
  else
    -- A RECLAIM by the SAME run is admitted: a crashed step re-executes and must find its own
    -- binding, not a refusal. A DIFFERENT run is refused, and the original binding is preserved
    -- (C-35: the correct old-run identity survives).
    v_claimed := (t.workflow_run_id = p_workflow_run_id
                  and t.status in ('running','awaiting_input'));
  end if;

  select at.status into v_status from clara.agent_tasks at where at.id = p_task;
  if v_claimed then
    update clara.accounting_work
       set status = case when status in ('queued','running') then 'running' else status end,
           bundle = p_bundle
     where id = t.work_id;
  end if;
  return jsonb_build_object('claimed', v_claimed, 'task_id', p_task, 'work_id', t.work_id,
    'status', v_status, 'run_bound', v_claimed);
end $$;
revoke all on function clara.claim_work_run(uuid,text,jsonb) from public;
grant execute on function clara.claim_work_run(uuid,text,jsonb) to clara_runtime;

-- =====================================================================================
-- §D  clara.settle_work_run — RECUT. Full 0178 body; the two additions are marked `#630`.
--
--   1. the Work row lock, taken FIRST (the lane's global order — see the header).
--   2. THE CANCEL TRANSLATION. A `cancel_requested` task with NO committed receipt settles
--      `cancelled`, whatever the run asked for, and the request rides under `error.superseded`.
--
-- WHY THE TRANSLATION IS HERE AND NOT IN THE RUNTIME. The frozen closure classifies the boundary's
-- own CLR13 `work_cancelled` as `state_changed` and therefore asks for `failed`; an engine abort
-- asks for `cancelled`; a refusal that lands after the cancel asks for `refused`. All three
-- describe the same event and only the DATABASE knows which of them raced a cancel. Putting the
-- translation in the one verb that writes terminals is what makes "one accepted transition" true
-- of the DATA rather than of whichever caller happened to settle first (C88.4).
-- =====================================================================================
create or replace function clara.settle_work_run(p_task uuid, p_outcome text, p_error_code text,
    p_error jsonb, p_result jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_task_status text; v_err text; v_work_status text;
  v_receipt jsonb; v_outcome text; v_overridden text;
  v_translated text; v_error_out jsonb;          -- #630
  v_converged text; v_work_task uuid;            -- #630
begin
  if p_outcome is null or p_outcome not in ('completed','refused','failed','cancelled','expired') then
    raise exception 'unknown settle outcome %', p_outcome using errcode='CLR10',
      detail='{"reason":"invalid_outcome"}';
  end if;
  if p_error_code is not null
     and p_error_code not in ('model_error','tool_error','timeout','engine_lost','limit','internal') then
    raise exception 'unknown task error code %', p_error_code using errcode='CLR10',
      detail='{"reason":"invalid_error_code"}';
  end if;
  if p_error is not null and jsonb_typeof(p_error) <> 'object' then
    raise exception 'the settle error must be a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_outcome","constraint":"error_object"}';
  end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then
    raise exception 'the settle result must be a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_outcome","constraint":"result_object"}';
  end if;
  select * into t from clara.agent_tasks at where at.id = p_task;
  if not found then
    raise exception 'task not found' using errcode='CLR11', detail='{"reason":"task_not_found"}';
  end if;
  if t.kind <> 'accounting_work' then
    raise exception 'settle_work_run is for accounting-work runs only (got kind %)', t.kind
      using errcode='CLR10', detail=jsonb_build_object('reason','wrong_task_kind','kind',t.kind)::text;
  end if;
  -- #630 · THE BOUNDARY, TAKEN FIRST -- before the task is re-read, before anything is decided.
  -- This is the lane's global lock order (accounting_work -> agent_tasks), and it is also what
  -- makes the receipt read below a decision rather than a guess: a posting transaction that is
  -- mid-flight holds this row, so this settle waits and then sees its receipt.
  select w.current_task_id into v_work_task
    from clara.accounting_work w where w.id = t.work_id for update;
  select * into t from clara.agent_tasks at where at.id = p_task;

  if t.status in ('completed','failed','cancelled','expired') then
    -- #630 · A REPLAY IS STILL ALLOWED TO REPAIR A BROKEN PAIR. The run is over, so nothing about
    -- it is settled again -- but a NON-terminal Work under a terminal run is the stranded state
    -- `clara.cancel_agent_task` can produce in one click, and the estate must not answer "already
    -- settled" about a Work that is still showing `queued` to a human. Converges by the receipt
    -- law; a Work that is already terminal is untouched and `converged` reads null.
    --
    -- ...AND ONLY ABOUT THE RUN THIS WORK IS STILL ON. A settle replayed for a SUPERSEDED run (a
    -- Retry, or the take-over that retries underneath, moved `current_task_id` on between the
    -- crash and the respawn) says nothing about the Work: `clara._converge_work_terminal` refuses
    -- it, and the answer carries `stale_task` so a sweep can count what it saw rather than guess
    -- from a null. The RUN's own reply is unchanged -- it really is already terminal.
    v_converged := clara._converge_work_terminal(t.work_id, p_task, t.status);
    return jsonb_build_object('work_id', t.work_id, 'task_id', p_task,
      'task_status', t.status,
      'status', (select w.status from clara.accounting_work w where w.id = t.work_id),
      'requested_outcome', p_outcome, 'overridden_by_receipt', false,
      'translated_by_cancel', false,
      'converged', v_converged,
      'stale_task', (v_work_task is distinct from p_task),
      'replayed', true);
  end if;

  -- THE BOOKS, BEFORE THE TRANSLATION. Asked once, of the one witness with standing.
  v_receipt := clara._work_committed_receipt(t.work_id);
  if v_receipt is not null and p_outcome <> 'completed' then
    v_overridden := p_outcome;
    v_outcome := 'completed';
  else
    v_outcome := p_outcome;
  end if;

  -- #630 · THE CANCEL TRANSLATION. Strictly BELOW the receipt override: a Work that recorded an
  -- effect is `completed` even though a cancel was requested (0178's law, and ARCHITECTURE §6's
  -- "取消不冲销已入账结果"). Only a cancel_requested run that posted NOTHING is translated, and the
  -- outcome it asked for is preserved rather than discarded.
  --
  -- THE ENUMERATION IS CLOSED AND `completed` IS DELIBERATELY OUTSIDE IT. The three listed outcomes
  -- are the three ways the frozen closure can describe a cancelled run — `failed` (its unrecognised
  -- CLR13 `work_cancelled` classifies `state_changed`, whose budget exhaustion settles `failed`),
  -- `refused` (a typed refusal that landed after the cancel) and `expired` (a parked run whose
  -- question died with it). A run asking for `completed` is ASSERTING it recorded an effect: if it
  -- did, the receipt override above already answered, and if it did not, writing `cancelled` over
  -- its claim would bury a disagreement between the run and the books instead of leaving it visible.
  -- Measured on the rig: `623.db.R2` plants exactly that shape (a Work `result` naming an entry with
  -- no `clara.operation_receipts` row) and a `<> 'cancelled'` predicate turned it into a cancel.
  if v_receipt is null and t.status = 'cancel_requested'
     and v_outcome in ('failed','refused','expired') then
    v_translated := v_outcome;
    v_outcome := 'cancelled';
  end if;

  v_task_status := case v_outcome
    when 'completed' then 'completed'
    when 'refused'   then 'failed'
    when 'failed'    then 'failed'
    when 'cancelled' then 'cancelled'
    else 'expired' end;
  v_err := case v_outcome
    when 'refused' then coalesce(p_error_code, 'tool_error')
    when 'failed'  then coalesce(p_error_code, 'internal')
    when 'completed' then null   -- a completed run carries no task error, forced or not
    else p_error_code end;
  -- #630 · a TRANSLATED cancel carries no task error code: the run did not fail, it was stopped
  -- (claraWork.v1.errors.ts's own `taskErrorCodeFor('cancelled')` is null).
  if v_translated is not null then v_err := null; end if;
  v_work_status := v_outcome;

  -- #630 · the error the WORK carries. Untranslated: the caller's own object, as 0178 wrote it.
  -- Translated: the cancellation's own words (byte-identical to the runtime's
  -- `cancelSettleForWork`, so the two paths cannot describe one event two ways) with the request
  -- preserved verbatim underneath.
  v_error_out := case
    when v_outcome = 'completed' then null
    when v_translated is null then p_error
    else clara._work_cancelled_error()
         || jsonb_build_object('superseded', jsonb_build_object('outcome', v_translated,
              'error_code', p_error_code, 'error', p_error))
    end;

  update clara.agent_tasks set status = v_task_status, error_code = v_err, updated_at = now()
   where id = p_task;
  update clara.accounting_work
     set status = v_work_status,
         error  = v_error_out,
         -- On an override the receipt's own effects ARE the result: the caller's result (if any)
         -- describes an outcome that did not happen, so it is not merged over the books.
         result = case when v_overridden is not null
                         then coalesce(result, '{}'::jsonb) || v_receipt
                       when v_translated is not null then result   -- #630: a cancel records no result
                       when p_result is null then result
                       else coalesce(result, '{}'::jsonb) || p_result end
   where id = t.work_id;

  -- THE PENDING QUESTION DIES WITH THE RUN (S4-D6). Every other terminal settle in the estate
  -- carries this cascade, and this verb is terminal for EVERY outcome it admits, the RECEIPT
  -- OVERRIDE included: a Work forced to `completed` by a committed receipt must not leave an
  -- unanswerable question behind either.
  update clara.agent_interruptions set status = 'cancelled'
   where task_id = p_task and status = 'pending';

  perform clara._audit(t.firm_id, clara.agent_user_id(), t.created_by, null,
    'settle_work_run', null,
    jsonb_build_object('work', t.work_id, 'task', p_task, 'outcome', v_work_status,
      'error_code', v_err, 'requested_outcome', p_outcome,
      'overridden_by_receipt', (v_overridden is not null),
      'translated_by_cancel', (v_translated is not null))
    || case when v_overridden is not null
              then jsonb_build_object('overridden_outcome', v_overridden, 'receipt', v_receipt)
            else '{}'::jsonb end
    || case when v_translated is not null
              then jsonb_build_object('superseded_outcome', v_translated)
            else '{}'::jsonb end);

  return jsonb_build_object('work_id', t.work_id, 'task_id', p_task,
    'task_status', v_task_status, 'status', v_work_status,
    'requested_outcome', p_outcome, 'overridden_by_receipt', (v_overridden is not null),
    'translated_by_cancel', (v_translated is not null),
    -- Always present, so a reader never has to tell "not stale" from "an older settle that did not
    -- know the word". A live run IS its Work's current one: `clara.retry_accounting_work` refuses
    -- to re-open a Work whose run has not settled (0178:1009-1014), so this reads false here.
    'stale_task', (v_work_task is distinct from p_task),
    'replayed', false);
end $$;
revoke all on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) from public;
grant execute on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) to clara_runtime;

-- =====================================================================================
-- §E  clara.work_authority_snapshot — RECUT, ADDITIVELY.
--
-- Every key 0180 returned keeps its name, its type and its meaning: the frozen
-- `recheckAuthorityStep` (claraWork.v2.impl.ts) reads `initiator_active`, `initiator_authorised`
-- and `initiator_role` to decide whether a resumed run may continue, and after a takeover those
-- three still describe the human the run acts AS, because §A made `initiator` that human. What is
-- ADDED is the pair a reader now needs to tell the two facts apart: `initiated_by` (who asked) and
-- `responsible` (an explicit alias for `initiator`, so a v3 closure can read the honest name
-- without this door changing shape again).
-- =====================================================================================
create or replace function clara.work_authority_snapshot(p_task uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'task_id', t.id,
    'task_status', t.status,
    'work_id', w.id,
    'work_status', w.status,
    'client_id', w.client_id,
    'client_status', cl.status,
    'basis_digest', w.basis_digest,
    'initiator', w.initiator,
    'initiator_role', m.role,
    'initiator_active', (m.status = 'active'),
    'initiator_authorised',
      coalesce(m.status = 'active' and clara.role_rank(m.role) >= clara.role_rank('bookkeeper'), false),
    -- #630 · the two facts told apart.
    'initiated_by', w.initiated_by,
    'responsible', w.initiator,
    'taken_over', (w.initiator is distinct from w.initiated_by))
  from clara.agent_tasks t
  join clara.accounting_work w on w.id = t.work_id
  join clara.clients cl on cl.id = w.client_id
  left join clara.firm_memberships m on m.firm_id = w.firm_id and m.user_id = w.initiator
  where t.id = p_task and t.kind = 'accounting_work';
$$;
revoke all on function clara.work_authority_snapshot(uuid) from public;
grant execute on function clara.work_authority_snapshot(uuid) to clara_runtime;

-- =====================================================================================
-- §F  clara._record_journal_entry_core — RECUT. Full 0182 body; additions marked `#630`.
-- =====================================================================================
create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
  v_task_status text;                                             -- #630
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  --
  -- #630 · AND IT IS LOCKED. `for update` here IS the ordering boundary between admitting this
  -- operation and cancelling the Work that authorised it (see this file's header). A cancel that
  -- arrives from here on waits until this transaction commits or rolls back, and then reads the
  -- truth rather than racing it.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose = 'journal_entry'
   for update;
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- 1b · #630 · THE OTHER SIDE OF THE BOUNDARY. The lock above is only half the contract: holding
  -- it proves nobody is cancelling RIGHT NOW, and these arms ask whether somebody already did.
  -- They sit BEFORE clara._reserve_op deliberately, so a refused operation leaves the logical
  -- identity unspent and a later Retry (or a takeover) can still use it.
  --
  -- A REPLAY IS NOT AN ADMISSION, AND THIS GUARD IS WHY THE WHOLE BLOCK IS CONDITIONAL. Measured on
  -- the rig (tests/work-cancel-e2e.mjs leg 4, first cut): a run that COMMITTED and then died before
  -- checkpointing re-executes its step on respawn, reaches this core again, and found the Work
  -- `completed` -- which an unconditional `work_settled` arm refused, breaking the one idempotency
  -- guarantee 0178 was built for. The effect is already on the books; returning it changes nothing
  -- and admits nothing, so a Work that HOLDS a committed receipt falls straight through to the
  -- reservation below, which answers with the stored result and `replayed:true`.
  --
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
  if clara._work_committed_receipt(p_work) is null then
    if w.status in ('stopping','cancelled') then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
    if w.status in ('completed','refused','failed','expired') then
      raise exception 'this accounting work already settled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_settled', 'status', w.status)::text;
    end if;
    -- …and the RUN's own abort request, which reaches the Work through the status mirror but may be
    -- read here first by a transaction that started before the mirror's update became visible.
    select t.status into v_task_status from clara.agent_tasks t where t.id = w.current_task_id;
    if v_task_status = 'cancel_requested' then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'task_status', v_task_status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
  end if;

  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  --
  -- #630 · AND THE READ IS SERIALISED WITH REVOCATION, not merely fresh. `for share` on the
  -- membership row is the second half of the boundary this file is about: without it a revocation
  -- can commit in the window between this SELECT and the INSERT below, and the entry posts under an
  -- authority that no longer existed when the books moved -- which is exactly what C79.2
  -- ("revocation wins before a later commit") forbids. The estate's revocation writers all UPDATE
  -- this row (`clara.remove_member` / `clara.set_member_role`, 0157:331/405), and an UPDATE
  -- conflicts with FOR SHARE, so the two orders are now decided rather than raced: a revocation
  -- that arrives first makes this read see it, and one that arrives second waits for this
  -- transaction and then applies to a world where the entry is already posted (and cannot erase
  -- it -- spec §5).
  -- …AND THE FIRM ROW IS TAKEN FIRST, because the revocation writers take it first. MEASURED on
  -- the rig (work-cancel.test.mjs wc.34, first cut): `clara.set_member_role` (0157) opens with
  -- `perform 1 from clara.firms where id = c.firm for update` and only then UPDATEs the
  -- membership, while this core took the membership FOR SHARE and reached `clara.firms` LATER —
  -- through the FK key-share every `operation_receipts`/`journal_entries` insert takes. Two
  -- transactions, two orders, one cycle: PostgreSQL broke it with 40P01, and a serialization
  -- failure on a posting is precisely the answer #630 exists to make impossible. `for key share`
  -- is the weakest lock that queues behind the revocation's `for update` (and it is the same mode
  -- the FK checks below need, so it is taken once rather than twice); two postings never block
  -- each other on it.
  perform 1 from clara.firms f where f.id = p_firm for key share;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
   for share;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN RESPONSIBLE HUMAN, not merely SOME live bookkeeper of the
  -- firm. Reviewed finding (#623): the two arms above ask whether `p_obo` still holds authority,
  -- and the wrapper asks whether the credential is pinned to this client -- neither asks whether
  -- this is the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's `on_behalf_of` --
  -- the estate's record of WHOSE AUTHORITY was rechecked -- would attribute the posting to a human
  -- who never authorised it. This is an authority check, not an input check: CLR04.
  --
  -- #630 · AND `initiator` NOW MEANS "the human this Work is executed as" (see §A), so after a
  -- takeover this arm binds the COLLEAGUE and refuses the person who admitted it -- which is exactly
  -- right, because they are the one who lost authority. The predicate is byte-identical to 0182's;
  -- only the column's meaning widened. The reason token is deliberately unchanged:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences, so if the WRITE read the raw echo instead,
  -- a padded account code would satisfy the digest and then land in clara.journal_lines with its
  -- padding — a stored line disagreeing with the identity that authorised it.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable.
  v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence.
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
  end if;

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id.
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document.
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id())
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    values (p_firm, p_client, p_work, 'journal_entry', p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes. THE INDEX'S OWN REFUSAL WEARS THE SAME
  -- NAME: a CONCURRENT sibling can post between 7b's read and this write, and then
  -- `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped as a
  -- raw 23505 with no `detail.reason`. A violation it cannot explain is RE-RAISED verbatim.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document));

  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false);
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

-- =====================================================================================
-- §G  clara.cancel_accounting_work — THE WORK-LEVEL CANCEL DOOR.
--
-- `clara.cancel_agent_task` (0133) cancels a RUN. This cancels the WORK — the durable unit a human
-- actually names ("Cancel Work" in B3 and B7) — and it is a different act with a different answer:
-- a queued Work has no run to abort, a Work that already posted has nothing left to cancel, and a
-- double cancel is not an error.
--
-- RUNTIME LANE, mirroring clara.retry_accounting_work's posture exactly: granted to clara_runtime
-- alone (the web reaches it through `POST /api/runtime/work/:id/cancel`, which authenticates the
-- human and passes their `sub`), no existence oracle across firms, an op-key reservation before
-- any effect, and the author's LIVE membership re-read at the door.
--
-- SIX ANSWERS, and the order they are asked in IS the contract. THE BOOKS ARE ASKED FIRST,
-- because every other question is only meaningful once the answer to that one is no:
--   1. a committed receipt exists          -> the operation WON. The RUN is still asked to abort
--                                             (the model must stop spending) and the Work reads
--                                             `completed` through the mirror's receipt law;
--                                             {cancelled:false, reason:'already_completed',
--                                              receipt_id, entry_id}
--   2. the Work already settled            -> {cancelled:false, reason:'already_terminal'}   (no raise)
--   3. the RUN already ended, the Work did not hear -> converge, then answer `already_terminal`
--   4. the abort is already requested      -> {cancelled:false, reason:'already_stopping'}, and
--                                             who asked FIRST is not overwritten
--   5. the run has not started (queued)    -> terminal `cancelled` through clara.settle_work_run
--   6. the run is live (running/parked)    -> task `cancel_requested`, Work `stopping`, NOTIFY
-- =====================================================================================
create function clara.cancel_accounting_work(p_work uuid, p_author uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_ctx jsonb;
  v_receipt jsonb; v_result jsonb; v_cancelled_at timestamptz;
  -- The current run is held in SCALARS rather than a record: `w.current_task_id` is nullable
  -- (nothing in the schema requires a Work to have a run), and an unassigned plpgsql record raises
  -- on its first field reference instead of reading NULL.
  v_task uuid; v_task_status text; v_task_cancelled_by uuid; v_task_cancelled_at timestamptz;
begin
  -- THE SHARED PREAMBLE (§A0): no existence oracle, an ACTIVE bookkeeper+ re-read at the door, and
  -- the typed op-key reservation. It takes NO lock -- the boundary below is this door's to take.
  v_ctx := clara._work_door_ctx(p_work, p_author, p_op_key,
    'cancel_accounting_work', 'cancel', 'cancelling');
  if v_ctx ? 'dedupe' then return (v_ctx->'dedupe') || '{"replayed":true}'::jsonb; end if;

  -- THE BOUNDARY. accounting_work -> agent_tasks -> agent_interruptions, in that order, and the
  -- FIRST lock is the same row clara._record_journal_entry_core takes. Everything below reads a
  -- world that cannot move under it.
  select * into w from clara.accounting_work aw where aw.id = p_work for update;
  if w.current_task_id is not null then
    select at.id, at.status, at.cancelled_by, at.cancelled_at
      into v_task, v_task_status, v_task_cancelled_by, v_task_cancelled_at
      from clara.agent_tasks at where at.id = w.current_task_id for update;
  end if;

  -- 1 · THE OPERATION ALREADY WON, AND THE BOOKS ARE ASKED BEFORE ANYTHING ELSE. A cancel does
  -- NOT reverse a posted entry (ARCHITECTURE §6, "取消不冲销已入账结果"); a correction is a
  -- separate, explicitly linked operation. The answer names the effect so the surface can link to
  -- it, and the Work reaches `completed` — never `cancelled`, never `stopping`.
  --
  -- THE RUN IS STILL ASKED TO ABORT, and that is the half an earlier cut left out. The WORK is
  -- finished; the RUN is a separate live thing that keeps taking turns (and spending) until it
  -- happens to stop on its own. A human who pressed "Cancel Work" one second after the commit was
  -- told nothing new would start, and that has to be true of the model too. So this arm writes the
  -- abort REQUEST and NOTIFYs, and leaves the settle to the runtime's cancel sweep, which is the
  -- only path that also reaches `cancelRun` — settling the task here would hide the row from that
  -- sweep and the engine would never be told. The WORK does not wait for it: the status mirror's
  -- receipt law writes `completed` on this very transition.
  v_receipt := clara._work_committed_receipt(p_work);
  if v_receipt is not null then
    if v_task is not null and v_task_status in ('running','awaiting_input') then
      update clara.agent_tasks set status = 'cancel_requested', cancelled_by = p_author,
             cancelled_at = now(), updated_at = now()
       where id = v_task;
      perform pg_notify('clara_runtime_ctl', '');   -- empty payload (N1)
    elsif v_task is not null and v_task_status in ('queued','held') then
      -- A run that never started and a Work that already posted: nothing to abort, so the terminal
      -- is reached now, through the ONE verb that writes this lane's terminals. (Reachable because
      -- nothing in the estate requires a run to have CLAIMED before it posts — the core attributes
      -- the receipt to `w.current_task_id` when the credential binds no task.)
      perform clara.settle_work_run(v_task, 'completed', null, null, v_receipt);
    elsif w.status not in ('completed','refused','failed','cancelled','expired') then
      -- A terminal run (or none at all) and a Work that never heard: converge on the receipt law.
      perform clara._converge_work_terminal(p_work, v_task, coalesce(v_task_status, 'completed'));
    end if;
    perform clara._audit(w.firm_id, p_author, null, null, 'cancel_accounting_work', null,
      jsonb_build_object('work', p_work, 'task', w.current_task_id, 'op_key', p_op_key,
        'outcome', 'already_completed', 'receipt', v_receipt));
    v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
      'status', (select aw.status from clara.accounting_work aw where aw.id = p_work),
      'cancelled', false, 'reason', 'already_completed',
      'receipt_id', v_receipt->>'receipt_id', 'entry_id', v_receipt->>'entry_id',
      'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  -- 2 · ALREADY TERMINAL. A double cancel is not an error: the human's intent is already true.
  if w.status in ('completed','refused','failed','cancelled','expired') then
    v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
      'status', w.status, 'cancelled', false, 'reason', 'already_terminal', 'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  -- 3 · THE RUN IS ALREADY OVER AND THE WORK NEVER HEARD. Reached whenever something other than
  -- clara.settle_work_run terminalised the run -- `clara.cancel_agent_task` from the /activity
  -- panel is the measured one. Converge by the receipt law (there is none here, arm 1 answered
  -- that), then answer about the Work that actually exists, under the SAME `already_terminal` word
  -- arm 2 speaks, so no surface needs new vocabulary.
  if v_task is not null and v_task_status in ('completed','failed','cancelled','expired') then
    perform clara._converge_work_terminal(p_work, v_task, v_task_status);
    select * into w from clara.accounting_work aw where aw.id = p_work;
    v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
      'status', w.status, 'cancelled', false, 'reason', 'already_terminal', 'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  -- 4 · ALREADY STOPPING. The abort is requested and the run is settling; asking twice changes
  -- nothing and must not re-notify the world or overwrite who asked first.
  if v_task is not null and v_task_status = 'cancel_requested' then
    v_result := jsonb_build_object('work_id', p_work, 'task_id', v_task, 'status', w.status,
      'cancelled', false, 'reason', 'already_stopping',
      'cancelled_by', v_task_cancelled_by, 'cancelled_at', v_task_cancelled_at, 'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  v_cancelled_at := now();
  -- The question cascade (S4-D6), taken while both rows are held. A run that is stopping must not
  -- go on offering a question nobody can consume.
  if v_task is not null then
    update clara.agent_interruptions set status = 'cancelled'
     where task_id = v_task and status = 'pending';
    update clara.agent_tasks set cancelled_by = p_author, cancelled_at = v_cancelled_at
     where id = v_task;
  end if;

  if v_task is null or v_task_status in ('queued','held') then
    -- 5 · NO ENGINE RUN. Nothing to abort, so the terminal is reached now — through
    -- clara.settle_work_run, because ONE verb writes this lane's terminals and a second writer is
    -- how a task row and a Work row come to disagree.
    if v_task is not null then
      perform clara.settle_work_run(v_task, 'cancelled', null, clara._work_cancelled_error(), null);
    else
      -- A WORK WITH NO RUN AT ALL. Reached by nothing the estate ships today (every admitted Work
      -- is minted with a task), which is exactly why it must not carry its own copy of the words:
      -- an arm no cell drives is an arm a copy-edit forgets.
      update clara.accounting_work
         set status = 'cancelled', error = clara._work_cancelled_error()
       where id = p_work;
    end if;
  else
    -- NO ARM FOR A TERMINAL RUN HERE, and its absence is deliberate rather than an omission. An
    -- earlier cut of this file carried one (a typed CLR13 `run_already_terminal`) as a belt behind
    -- arm 3; review measured that it could never execute. Arm 3 fires for EVERY terminal
    -- `v_task_status` and RETURNS, and both rows stay locked from the top of this function, so by
    -- the time control reaches here `v_task_status` can only be null (caught by the branch above),
    -- 'queued', 'held', 'cancel_requested' (arm 4) or one of the live statuses. Pinning a refusal
    -- the database cannot raise is worse than not pinning one: the route arm, its unit cell and
    -- the web's refusal roster all read as coverage of a path that does not exist. If a future
    -- change makes arm 3's convergence conditional, THAT change owns re-opening this arm — and
    -- must bring a cell that reaches it.
    -- 6 · A LIVE ENGINE RUN. The cancel is a REQUEST: the runtime aborts the run and then settles
    -- it (clara.settle_work_run translates whatever it asks for). The Work reads `stopping`
    -- through the status mirror until that boundary is known.
    update clara.agent_tasks set status = 'cancel_requested', updated_at = now() where id = v_task;
    perform pg_notify('clara_runtime_ctl', '');   -- empty payload (N1)
  end if;

  perform clara._audit(w.firm_id, p_author, null, null, 'cancel_accounting_work', null,
    jsonb_build_object('work', p_work, 'task', w.current_task_id, 'op_key', p_op_key,
      'from_status', w.status, 'task_status', v_task_status));

  v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
    'status', (select aw.status from clara.accounting_work aw where aw.id = p_work),
    'cancelled', true, 'cancelled_by', p_author, 'cancelled_at', v_cancelled_at,
    'replayed', false);
  return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
end $$;
revoke all on function clara.cancel_accounting_work(uuid,uuid,text) from public;
grant execute on function clara.cancel_accounting_work(uuid,uuid,text) to clara_runtime;
comment on function clara.cancel_accounting_work(uuid,uuid,text) is
  '#630 B3/B7. Cancel the remaining Work. Locks clara.accounting_work FIRST (the lane''s ordering '
  'boundary), then its current run and that run''s pending questions. A Work holding a committed '
  'receipt settles `completed` and is never reported cancelled; a live run is asked to abort and '
  'the Work reads `stopping` until clara.settle_work_run knows the answer.';

-- =====================================================================================
-- §H  clara.take_over_accounting_work — A COLLEAGUE PICKS UP AN ORPHANED WORK (story 29).
--
-- The case is exactly the one #612 §5 names: a Work refused because the person who asked for it
-- lost authority. The books are untouched, the basis still stands, and the firm still needs the
-- entry — but `clara.retry_accounting_work` cannot help, because the commit rechecks the Work's
-- responsible human and that human is gone.
--
-- THE RUN IS CREATED BY clara.retry_accounting_work ITSELF, not by a copy of its body. One code
-- path for run creation means the takeover cannot drift from the Retry a human presses in B3 — and
-- it re-runs every gate that door already owns (active bookkeeper+, active client, a settled
-- current run, a terminal Work) under this door's own author. The reservation namespaces differ, so
-- the two op-key spaces never collide.
--
-- THE BASIS GATE. A `user_direct` basis is the human's own typed figures and needs no confirmation.
-- A `clara_interpreted` one was derived from prose the colleague has not read, so taking
-- responsibility for it means confirming the digest of what they DID read — otherwise a colleague
-- could authorise an interpretation they never saw. CLR10 `basis_confirmation_required` hands the
-- digest back so the surface can show the basis and resubmit with it.
-- =====================================================================================
create function clara.take_over_accounting_work(p_work uuid, p_author uuid, p_op_key text,
    p_basis_digest text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_ctx jsonb;
  v_resp_role text; v_resp_status text; v_resp_authorised boolean;
  v_live text; v_retry jsonb; v_previous uuid; v_result jsonb;
begin
  -- THE SHARED PREAMBLE (§A0) -- the same one clara.cancel_accounting_work opens with, so the
  -- bookkeeper floor of this lane is ONE line to change rather than three to remember.
  v_ctx := clara._work_door_ctx(p_work, p_author, p_op_key,
    'take_over_accounting_work', 'takeover', 'taking responsibility for');
  if v_ctx ? 'dedupe' then return (v_ctx->'dedupe') || '{"replayed":true}'::jsonb; end if;

  -- THE BOUNDARY, same first lock as every other writer in this lane.
  select * into w from clara.accounting_work aw where aw.id = p_work for update;
  v_previous := w.initiator;

  -- IS IT TAKEABLE? Terminal AND orphaned, and ORPHANED IS A FACT ABOUT THE WORLD NOW -- never a
  -- fact about the stored error. A Work refused `authority_lost` whose human has since been
  -- reinstated is THEIRS AGAIN: their Retry works, and a colleague seizing it would move the
  -- authority a posted entry is committed under away from the person who asked for it. A Work that
  -- failed for any other reason is takeable the moment its responsible human is gone.
  --
  -- The predicate is therefore ONE live re-read and nothing else. (The earlier cut also admitted a
  -- stored `authority_lost`, which -- because `or` binds looser than `and` -- made the live re-read
  -- decide nothing in exactly the case the UI offers the button on.)
  select m.role, m.status into v_resp_role, v_resp_status from clara.firm_memberships m
   where m.user_id = w.initiator and m.firm_id = w.firm_id
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  v_resp_authorised := coalesce(v_resp_status = 'active'
    and clara.role_rank(v_resp_role) >= clara.role_rank('bookkeeper'), false);
  if w.status not in ('refused','failed','expired') or v_resp_authorised then
    raise exception 'this accounting work is not available to take over'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','not_takeable', 'status', w.status,
          'responsible_authorised', v_resp_authorised)::text;
  end if;
  select t.status into v_live from clara.agent_tasks t where t.id = w.current_task_id;
  if v_live is not null and v_live not in ('completed','failed','cancelled','expired') then
    raise exception 'the current run of this work is still % -- settle it first', v_live
      using errcode='CLR13',
        detail=jsonb_build_object('reason','not_takeable','status',w.status,'task_status',v_live)::text;
  end if;

  -- THE BASIS GATE.
  if w.basis_origin <> 'user_direct'
     and (p_basis_digest is null or p_basis_digest is distinct from w.basis_digest) then
    raise exception 'this work rests on an interpreted basis; confirm the basis you read'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','basis_confirmation_required',
          'basis_origin', w.basis_origin, 'basis_digest', w.basis_digest)::text;
  end if;

  -- THE EFFECT, in this order: responsibility first, so the new run is created under — and minted
  -- OBO — the human who will actually execute it. `initiated_by` never moves; the immutability
  -- trigger refuses it and would refuse a handover to anyone who is not an active bookkeeper here.
  update clara.accounting_work set initiator = p_author where id = p_work;

  perform clara._audit(w.firm_id, p_author, null, null, 'take_over_accounting_work', null,
    jsonb_build_object('work', p_work, 'op_key', p_op_key, 'from_status', w.status,
      'previous_responsible', v_previous, 'initiated_by', w.initiated_by,
      'logical_op_id', w.logical_op_id));
  perform clara._append_event(w.firm_id, 'work.taken_over', w.client_id, p_author, null, null,
    null, null, null,
    jsonb_build_object('work', p_work, 'previous_responsible', v_previous,
      'new_responsible', p_author, 'initiated_by', w.initiated_by, 'from_status', w.status,
      'logical_op_id', w.logical_op_id));

  -- ONE CODE PATH FOR RUN CREATION. `clara.retry_accounting_work` mints the task, repoints
  -- `current_task_id`, clears the previous attempt's error/result and writes its own audit row.
  v_retry := clara.retry_accounting_work(p_work, p_author, 'takeover:' || p_op_key);

  v_result := jsonb_build_object('work_id', p_work, 'task_id', v_retry->>'task_id',
    'logical_op_id', w.logical_op_id, 'status', v_retry->>'status',
    'responsible', p_author, 'previous_responsible', v_previous, 'initiated_by', w.initiated_by,
    'taken_over', true, 'replayed', false);
  return clara._finish_op(w.firm_id, 'take_over_accounting_work', p_op_key, v_result);
end $$;
revoke all on function clara.take_over_accounting_work(uuid,uuid,text,text) from public;
grant execute on function clara.take_over_accounting_work(uuid,uuid,text,text) to clara_runtime;
comment on function clara.take_over_accounting_work(uuid,uuid,text,text) is
  '#630 story 29. A currently authorised colleague takes responsibility for a terminal Work whose '
  'responsible human lost authority. Moves clara.accounting_work.initiator — the column the '
  'deploy-locked claraWork closure mints every credential on behalf of — while `initiated_by` keeps '
  'the immutable record of who asked; records a work.taken_over timeline event; and creates the new '
  'run through clara.retry_accounting_work so there is ONE code path for run creation.';

-- =====================================================================================
-- §H2  THREE OLDER DOORS, RECUT. The lock order is made global, the credential mint TYPES its
-- authority refusal, and clara.list_entry_links stops pairing one person's id with another's rank.
--
-- An earlier cut of this file left `clara.cancel_agent_task` (0133) and `clara.open_work_question`
-- (0180) taking the TASK row first and reaching `clara.accounting_work` afterwards -- the inverse
-- of this lane's boundary -- and named the resulting deadlock as a transient both callers would
-- absorb. MEASURED, and it does not hold: a human's /activity cancel racing a Work-level cancel
-- (or a run parking on a question exactly as a human cancels) raises 40P01, and nothing on the
-- route or in the web retries it -- the human gets a raw 500 and nothing happened.
--
-- So both doors are recut here, with their full bodies, to take the Work row FIRST when the task
-- is an `accounting_work` one. Nothing else about either door changes, and neither becomes
-- dependent on a relation that might be absent: `clara.accounting_work` exists from 0178, and both
-- recuts are guarded on the task's own kind, so every other kind takes exactly the path it took
-- before. (The route also maps 40P01/40001 to a typed transient conflict now -- defence in depth,
-- not the fix.)
-- =====================================================================================
set role clara_fn_owner;

-- ------------------------------------------------------------------------------------
-- clara.cancel_agent_task -- RECUT. Full 0133 body; the addition is the pre-lock.
-- ------------------------------------------------------------------------------------
create or replace function clara.cancel_agent_task(p_task uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; t record; v_new_status text;
        v_kind text; v_work uuid;                                   -- #630
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'cancel_agent_task', p_op_key, clara._hash(jsonb_build_object('t', p_task)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- #630 · THE ACCOUNTING-WORK BOUNDARY, TAKEN FIRST. A LOCK-FREE pre-read of two IMMUTABLE task
  -- columns (`kind` and `work_id` are set at insert and never move), then the Work row, and only
  -- then the task -- the lane's global order, accounting_work -> agent_tasks -> agent_interruptions.
  -- Every other task kind is untouched and takes the task row first exactly as before.
  select at.kind, at.work_id into v_kind, v_work from clara.agent_tasks at where at.id = p_task;
  if v_kind = 'accounting_work' and v_work is not null then
    perform 1 from clara.accounting_work w where w.id = v_work for update;
  end if;

  -- Lock the task, then its interruptions (a single global lock order).
  select * into t from clara.agent_tasks where id = p_task for update;
  if not found or t.firm_id <> c.firm then raise exception 'task not in your firm' using errcode = 'CLR11'; end if;

  -- #630 · WHAT THIS CALL DID, said separately from what the task now IS. `status` alone cannot
  -- tell a press that TERMINALLY CANCELLED a queued turn ('cancelled', below) from a press that
  -- found a turn which had already ended by itself ('cancelled' here too) -- and a surface reading
  -- only `status` announced the successful stop of a queued reply as "Nothing was stopped -- this
  -- reply had already finished". `changed` is that fact, and `transition` names the act:
  --   cancel_requested  the engine is active; it was asked to abort      (changed)
  --   cancelled         no engine run; this call settled the task        (changed)
  --   already_terminal  the task had already ended; nothing was done     (unchanged)
  --   already_requested a cancel was already pending; nothing was done   (unchanged)
  -- ADDITIVE: both keys are new, `task_id`/`status` keep their meaning, and an op-key REPLAY still
  -- returns the first call's stored receipt verbatim (clara._finish_op) -- so the same press
  -- retried reads `changed:true`, which is the truth about that press.
  if t.status in ('completed','failed','cancelled','expired') then
    return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
      jsonb_build_object('task_id', p_task, 'status', t.status,
        'changed', false, 'transition', 'already_terminal'));          -- idempotent: already terminal
  end if;
  if t.status = 'cancel_requested' then
    return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
      jsonb_build_object('task_id', p_task, 'status', 'cancel_requested',
        'changed', false, 'transition', 'already_requested'));         -- already requested
  end if;

  -- Cascades (S4-D6): pending interruptions → cancelled; a held wake task's outbox → cancelled.
  update clara.agent_interruptions set status = 'cancelled' where task_id = p_task and status = 'pending';
  -- MUST A: the outbox cascade is guarded on t.status = 'held' TOO -- a RUNNING wake task's cancel
  -- is only a REQUEST (v_new_status below), never a terminal settle, so its outbox twin must stay
  -- 'held' until the real settlement path (clara._settle_wake_task) says otherwise.
  if t.kind = 'wake' and t.origin_intent_id is not null and t.status = 'held' then
    update clara.wakes_outbox set status = 'cancelled' where intent_id = t.origin_intent_id and status = 'held';
  end if;

  if t.status in ('running','awaiting_input') then
    v_new_status := 'cancel_requested';                               -- engine still active; runtime aborts + settles
  else
    v_new_status := 'cancelled';                                      -- queued/held: no engine run -- terminal settle
  end if;
  update clara.agent_tasks
     set status = v_new_status, cancelled_by = c.actor, cancelled_at = now(), updated_at = now()
   where id = p_task;

  perform clara._audit(c.firm, c.actor, null, null, 'cancel_agent_task', null,
    jsonb_build_object('task', p_task, 'op_key', p_op_key));
  perform pg_notify('clara_runtime_ctl', '');                         -- empty payload
  return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
    jsonb_build_object('task_id', p_task, 'status', v_new_status,
      'changed', true, 'transition', v_new_status));                  -- #630: this call DID it
end $$;
revoke all on function clara.cancel_agent_task(uuid, text) from public;
grant execute on function clara.cancel_agent_task(uuid, text) to clara_authenticated;

-- ------------------------------------------------------------------------------------
-- clara.open_work_question -- RECUT. Full 0180 body; the Work lock MOVES ahead of the task
-- transition, and the second (now redundant) lock becomes a plain re-read under it.
-- ------------------------------------------------------------------------------------
create or replace function clara.open_work_question(p_task uuid, p_hook_token text, p_question jsonb,
    p_fields jsonb, p_reason text default null, p_source_ref jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_id uuid; v_task uuid; v_upd int; t record; w record; v_version int; v_expires timestamptz;
  v_constraint text;
begin
  if p_hook_token is null or p_hook_token ~ '^\s*$' then
    raise exception 'a hook_token is required' using errcode='CLR10',
      detail='{"reason":"invalid_hook_token"}';
  end if;
  perform clara._assert_work_question_fields(p_fields);

  -- (1) IDEMPOTENT replay on the globally-unique hook token.
  select id, task_id into v_id, v_task from clara.agent_interruptions where hook_token = p_hook_token;
  if v_id is not null then
    if v_task <> p_task then
      raise exception 'hook_token is already bound to a different task' using errcode='CLR13',
        detail='{"reason":"hook_token_bound"}';
    end if;
    select id, work_id, question_version, expires_at into v_id, v_task, v_version, v_expires
      from clara.agent_interruptions where id = v_id;
    return jsonb_build_object('question_id', v_id, 'work_id', v_task,
      'question_version', v_version, 'expires_at', v_expires, 'replayed', true);
  end if;

  select at.id, at.kind, at.status, at.work_id into t
    from clara.agent_tasks at where at.id = p_task;
  if t.id is null then
    raise exception 'task not found' using errcode='CLR11', detail='{"reason":"task_not_found"}';
  end if;
  if t.kind <> 'accounting_work' then
    raise exception 'open_work_question is for accounting-work runs only (got kind %)', t.kind
      using errcode='CLR10', detail=jsonb_build_object('reason','wrong_task_kind','kind',t.kind)::text;
  end if;
  if t.work_id is null then
    raise exception 'this accounting-work task is bound to no Work' using errcode='CLR10',
      detail='{"reason":"work_unbound"}';
  end if;
  select aw.id, aw.client_id, aw.basis_digest into w
    from clara.accounting_work aw where aw.id = t.work_id;

  -- (2) #630 · SERIALISE ON THE WORK **BEFORE** THE TASK IS TOUCHED. 0180 took this lock AFTER
  -- the task transition, on the reasoning that the transition had already touched the Work through
  -- the status mirror -- true, and it is the wrong order: `clara.cancel_accounting_work` takes the
  -- Work first and the task second, so a park racing a cancel of the same Work was an ABBA cycle
  -- that PostgreSQL broke with 40P01. The lane's order is accounting_work -> agent_tasks
  -- -> agent_interruptions and this door now takes it that way, with no other change: everything
  -- below still reads a snapshot taken AFTER any competing open committed.
  perform 1 from clara.accounting_work where id = w.id for no key update;

  -- (3) Linearisation: a DIFFERENT pending question already blocks this task, or another task of
  --     the SAME Work is already parked on one. Both raise the same typed refusal because they are
  --     the same fact to the caller: this Work is already waiting.
  if exists (select 1 from clara.agent_interruptions
              where status = 'pending' and (task_id = p_task or work_id = w.id)) then
    raise exception 'a question is already pending for task % (work %)', p_task, w.id
      using errcode='CLR13', detail='{"reason":"question_already_pending"}';
  end if;

  -- (4) Conditional transition; zero rows ⇒ not running ⇒ CLR13 and NO insert.
  update clara.agent_tasks set status = 'awaiting_input', updated_at = now()
    where id = p_task and status = 'running';
  get diagnostics v_upd = row_count;
  if v_upd = 0 then
    select id into v_id from clara.agent_interruptions where hook_token = p_hook_token and task_id = p_task;
    if v_id is not null then
      select id, work_id, question_version, expires_at into v_id, v_task, v_version, v_expires
        from clara.agent_interruptions where id = v_id;
      return jsonb_build_object('question_id', v_id, 'work_id', v_task,
        'question_version', v_version, 'expires_at', v_expires, 'replayed', true);
    end if;
    raise exception 'cannot open a question: task % is not running', p_task using errcode='CLR13',
      detail='{"reason":"task_not_running"}';
  end if;

  -- (5) ASK AGAIN UNDER THE LOCK. Redundant now that the lock is taken in (2) -- kept because it
  --     costs one index probe and it is what makes the linearisation a property of the DATA rather
  --     than of the order two statements happen to sit in.
  if exists (select 1 from clara.agent_interruptions
              where status = 'pending' and (task_id = p_task or work_id = w.id)) then
    raise exception 'a question is already pending for work % (raced)', w.id
      using errcode='CLR13', detail='{"reason":"question_already_pending"}';
  end if;

  select coalesce(max(question_version), 0) + 1 into v_version
    from clara.agent_interruptions where work_id = w.id;

  -- (6) THE INSERT, with the unique indexes as the belt behind the lock. A duplicate that reaches
  --     here anyway is re-raised INSIDE 0180's published roster; a raw 23505 escaping a
  --     runtime-lane verb would be classified `conflict` by claraWork's router and settle a Work
  --     `refused` with "that operation identity is already used by a different payload", which is
  --     not what happened.
  begin
    insert into clara.agent_interruptions
        (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
         basis_digest, fields, reason, source_ref)
      values (p_task, p_hook_token, coalesce(p_question, '{}'::jsonb), now() + interval '14 days',
         w.id, w.client_id, v_version, w.basis_digest, p_fields,
         nullif(btrim(coalesce(p_reason,'')), ''), p_source_ref)
      returning id, expires_at into v_id, v_expires;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'agent_interruptions_hook_token_key' then
      raise exception 'hook_token is already bound to a different task' using errcode='CLR13',
        detail='{"reason":"hook_token_bound"}';
    end if;
    raise exception 'a question is already pending for work % (index %)', w.id, coalesce(v_constraint,'?')
      using errcode='CLR13', detail='{"reason":"question_already_pending"}';
  end;

  return jsonb_build_object('question_id', v_id, 'work_id', w.id,
    'question_version', v_version, 'expires_at', v_expires, 'replayed', false);
end $$;
revoke all on function clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb) from public;
grant execute on function clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb) to clara_runtime;

-- ------------------------------------------------------------------------------------
-- clara.mint_wake_credential -- RECUT. Full 0133 body; the change is ONE `detail` clause.
--
-- MEASURED ON THE RIG, and it is the reason B3 could not offer the right action. When a human's
-- membership is revoked mid-run, the refusal the Work actually settles on is not the posting core's
-- typed `obo_not_active` -- it is THIS door's, raised on the run's next tool call, and it carried
-- NO detail. The frozen roster classifies an unrecognised CLR10 as a refusal (right), so the Work
-- settled `refused` with `error.reason = null` (wrong): every surface that asks "was this an
-- authority loss?" got null, `isTakeOverable` said no, and the only action the page could offer was
-- a Retry that mints the SAME dead credential and dies the same way.
--
-- The token is `authority_lost` -- the same word `recheckAuthorityStep` (claraWork.v2) already
-- settles a resumed run on, so one fact has one name however it is discovered. Nothing else in the
-- body moves: same signature, same gates, same grants.
-- ------------------------------------------------------------------------------------
create or replace function clara.mint_wake_credential(p_wake_kind text, p_firm uuid, p_on_behalf_of uuid DEFAULT NULL::uuid, p_ttl interval DEFAULT '00:15:00'::interval, p_client uuid DEFAULT NULL::uuid)
 RETURNS TABLE(credential_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_secret text; v_id uuid;
begin
  -- F-A2 (D34/GB-3), F-A3 (Annex D), F-A7 beta (D-12), Gate G1 (ANNEX-B CORRECTION): the EARLY
  -- kind gate.
  if p_wake_kind is null or p_wake_kind not in ('interactive','proactive','autodraft','interactive_client','bank_agent','filing','close_prep') then
    raise exception 'bad wake_kind' using errcode='CLR10';
  end if;
  if p_firm is null or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'unknown firm' using errcode='CLR10';
  end if;
  -- (No TTL-positivity guard: unpinned; a non-positive TTL mints an already-dead
  -- credential -- harmless, and the rig's expiry probes rely on it.)
  if p_on_behalf_of is not null and not exists(
      select 1 from clara.firm_memberships where user_id=p_on_behalf_of
        and firm_id=p_firm and status='active'
        and clara.role_rank(role)>=clara.role_rank('bookkeeper')) then
    -- #630 -- TYPED. This is an AUTHORITY LOSS and it is now said so, in the one word the lane
    -- already uses for it.
    raise exception 'on_behalf_of must be an active bookkeeper+ of the firm'
      using errcode='CLR10', detail='{"reason":"authority_lost"}';
  end if;
  if p_wake_kind='autodraft' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'autodraft wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='interactive_client' then
    -- The pinned chat kind: a firm-congruent ACTIVE client exactly as autodraft demands, and
    -- on_behalf_of is KEPT (the generic bookkeeper+ membership check above still governs it).
    if p_client is null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'interactive_client wake requires a firm-congruent active client'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='bank_agent' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'bank_agent wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='close_prep' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'close_prep wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='filing' then
    if p_client is not null then
      raise exception 'filing wake requires no client binding (attribution has no client yet)'
        using errcode='CLR10';
    end if;
  elsif p_client is not null then
    raise exception 'legacy wake kinds do not accept a client binding' using errcode='CLR10';
  end if;
  v_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at)
    values(p_wake_kind,p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl)
    returning id into v_id;
  return query select v_id,v_secret;
end $function$;
revoke all on function clara.mint_wake_credential(text,uuid,uuid,interval,uuid) from public;
grant execute on function clara.mint_wake_credential(text,uuid,uuid,interval,uuid) to clara_runtime;

-- ------------------------------------------------------------------------------------
-- clara.list_entry_links -- RECUT. Full 0182 body; the change is the PROVENANCE PAIR.
--
-- 0182 emitted `('initiator', aw.initiator)` beside `('initiator_role', aw.initiator_role)` as one
-- fact. Section A split that column into two: `initiator` is now the human the Work is EXECUTED AS
-- and moves on a takeover, while `initiator_role` stayed the ADMISSION snapshot -- so after a
-- handover the old pair reports one person's id beside another person's rank, on the estate's own
-- journal-provenance door. Three fields, each true on its own: who asked (`initiated_by`), at what
-- rank they asked (`initiated_by_role`), and who is answerable now (`responsible`).
-- ------------------------------------------------------------------------------------
create or replace function clara.list_entry_links(p_client uuid, p_entries uuid[]) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid; v_n int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  v_n := coalesce(array_length(p_entries, 1), 0);
  if v_n > 500 then
    raise exception 'too many entries in one links read (% > 500)', v_n using errcode='CLR10',
      detail=jsonb_build_object('reason','too_many_entries','limit',500)::text;
  end if;
  if v_n = 0 then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id',        je.id,
        'status',          je.status,
        'origin',          je.origin,
        'work_id',         coalesce(o.work_id, l.work_id),
        'receipt_id',      o.id,
        'logical_op_id',   coalesce(o.logical_op_id, l.logical_op_id),
        'purpose',         aw.purpose,
        'basis_origin',    aw.basis_origin,
        -- #630 -- TWO PEOPLE, TOLD APART (see the note above this function).
        'initiated_by',      aw.initiated_by,
        'initiated_by_role', aw.initiator_role,
        'responsible',       aw.initiator,
        -- ONE FIELD FOR "the source document", whichever lane bound it, plus the lane itself so
        -- the surface can say HOW it was bound rather than guessing from a null.
        'document_id',     coalesce(l.document_id, je.document_id),
        'document_source', case when l.document_id is not null then l.attached_via
                                when je.document_id is not null then 'document_coding'
                                else null end,
        'attached_at',     l.attached_at,
        -- #634 (reviewed finding) - WHEN THE BINDING STOPPED BEING THE LIVE ONE, or null. A
        -- reversed entry keeps reporting the document it was backed by - the chain stays
        -- inspectable - and this instant is what says the document is now free for the
        -- correction.
        'released_at',     l.released_at,
        'reversal_of',     je.reversal_of,
        'reversed_by',     je.reversed_by,
        'reversal_reason', je.reversal_reason)
      order by je.id)
      from clara.journal_entries je
      left join clara.entry_evidence_links l on l.entry_id = je.id
      left join clara.operation_receipts o
        on o.effects->>'entry_id' = je.id::text and o.outcome = 'committed'
      left join clara.accounting_work aw on aw.id = coalesce(o.work_id, l.work_id)
     where je.client_id = p_client and je.firm_id = c.firm
       and je.id = any(p_entries)), '[]'::jsonb);
end $$;
revoke all on function clara.list_entry_links(uuid,uuid[]) from public;
grant execute on function clara.list_entry_links(uuid,uuid[]) to clara_authenticated;
comment on function clara.list_entry_links(uuid, uuid[]) is
  '#634 C3 journal surface, #630 provenance recut. Per entry: Work, operation receipt, logical '
  'operation id, purpose, basis origin, who ADMITTED it and at what rank (initiated_by / '
  'initiated_by_role), who is RESPONSIBLE now, source document (evidence link OR the '
  'document-coding column, with the lane named and released_at when a reversal freed the binding) '
  'and the correction chain. Bookkeeper+, firm+client floored, batch cap 500.';

reset role;

-- =====================================================================================
-- §I  THE TIMELINE TYPE. Registered at the ACTIVE taxonomy version in the SAME migration that
-- first emits it — clara.event_types' own coverage law (rig-docs-events §3.7) requires the active
-- taxonomy to route EVERY catalog row, so shipping the pair together is the only shape that never
-- leaves the anti-join non-empty for even one migration. `ignore`: a takeover moves WHO is
-- answerable, and changes no accounting fact Clara's context pack reads.
-- =====================================================================================
set role clara_fn_owner;
insert into clara.event_types(name, client_scoped, description)
  values ('work.taken_over', true,
          'A colleague took responsibility for accounting work whose responsible member lost authority');
insert into clara.trigger_taxonomy(version, event_type, decision, note)
  select ta.version, 'work.taken_over', 'ignore',
         '#630: a takeover changes who is answerable for a Work, not any fact about the books'
    from clara.taxonomy_active ta;
reset role;

-- =====================================================================================
-- §I2  THE ACTIVITY FEED'S TWO DOORS — RECUT, from 0183's FINAL bodies.
--
-- These two were carried in this file's header as a TODO while #728's 0183 was in flight: two
-- lanes emitting two full bodies of one function is a merge that resolves itself wrongly and
-- silently, so the recut waited for 0183 to land and is derived from 0183's installed text
-- (prosrc-sha-pinned in the prestate block above, exactly the way 0183 pinned 0181's). The
-- bodies below are 0183's, byte-for-byte, plus TWO additions, each marked `#630`:
--
--   1. `when v.event_type like 'work.%' then 'work'` in BOTH kind ladders (list_activity's
--      ev_base and get_activity_event's 'event' arm). §I registers `work.taken_over`, the
--      estate's FIRST `work.%` type; without the arm the closed ladder's `else` files a
--      handover under `documents`.
--   2. `initiated_by` and `responsible` beside the unchanged `initiator` on the
--      operation_receipt arm of the detail door — §A's split, reaching the surface that reads it.
--
-- EVERYTHING ELSE IS 0183's AND STAYS 0183's: `set plan_cache_mode = force_custom_plan` on both
-- (0183's own BLOCKER [0]), `set search_path = clara, pg_temp`, SECURITY INVOKER, the bookkeeper
-- floor, the 18-column projection, `v_kept_sweeps` read once and tested with `= any(...)`, the
-- detail door's HOISTED `clara._sweep_event_has_effect` call after the row is fetched. The
-- `activity-feed` battery's af.20/af.21/af.22/af.23 read the LIVE catalog for exactly those
-- properties and are the gate on this claim, not this comment.
--
-- Grants are NOT re-issued: `create or replace` preserves them, and 0183's revoke/grant pair
-- already put both doors at clara_authenticated-only. The tail census re-reads that.
-- =====================================================================================
set role clara_fn_owner;


create or replace function clara.list_activity(
  p_cursor text default null,
  p_limit  int  default 50,
  p_client uuid default null,
  p_kinds  text[] default null,
  p_since  timestamptz default null,
  p_until  timestamptz default null
) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  -- #728 (delta review round 4, BLOCKER [0]): THE DOOR RE-PLANS ITSELF, EVERY CALL. Round 3 put
  -- this clause on the two helpers and stopped there; the union below binds `c.firm`, `p_client`,
  -- `p_kinds`, `p_since`, `p_until`, the cursor pair, `v_limit` AND `v_kept_sweeps` as plpgsql
  -- parameters of ONE cached statement, so the door carried the identical defect one level up.
  -- See section 1's header for the two measured flip sites and their series.
  set plan_cache_mode = force_custom_plan
as $$
declare
  c record;
  v_limit int;
  v_cursor_ts timestamptz := null;
  v_cursor_id text := null;
  v_decoded text;
  v_pipe int;
  v_kind text;
  v_all jsonb;
  v_total int;
  v_truncated boolean;
  v_page jsonb;
  v_last jsonb;
  v_next_cursor text;
  -- #728 (N1): the KEPT sweep receipts of this firm, read ONCE per call -- see the predicate
  -- inside ev_base below, and section 1's header for why this is not a per-row call.
  v_kept_sweeps uuid[];
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  if p_kinds is not null then
    foreach v_kind in array p_kinds loop
      if v_kind not in ('documents', 'journal', 'close', 'report', 'agent', 'work') then
        raise exception 'unknown activity kind %', v_kind using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_kind', 'kind', v_kind)::text;
      end if;
    end loop;
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_pipe := position('|' in v_decoded);
      if v_pipe < 2 or v_pipe = length(v_decoded) then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_ts := substr(v_decoded, 1, v_pipe - 1)::timestamptz;
      v_cursor_id := substr(v_decoded, v_pipe + 1);
    exception when others then
      raise exception 'malformed activity cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  -- #728 (N1): ONE invocation of the definer set helper per feed read, materialised into a local
  -- array the union's predicate can test with a plain `= any(...)`. Placed AFTER the floor checks
  -- (a refused caller never pays for it) and BEFORE the union, so no plan the planner might choose
  -- can turn it back into a per-row call.
  --
  -- …and NOT paid at all when no sweep row could survive this read's own filters (delta review of
  -- the fix round, finding [1]: the read was unconditional). A sweep receipt's `kind` is
  -- unconditionally 'agent' -- ev_base's FIRST case arm below, ahead of the 0181 ladder -- so a
  -- p_kinds list that omits 'agent' can never return one, and an EMPTY kept set then excludes
  -- every sweep row in ev_base, which is where those rows were headed anyway. The guard is on
  -- p_kinds ONLY and deliberately not on p_client: a sweep receipt written by
  -- clara.reconcile_sweep_runs is firm-level (client_id null, 0011:2763-2764), but `client_id` is
  -- a column on the event, not a law about it, and a client-scoped read must not start deciding
  -- what a row IS from what this file expects it to be.
  if p_kinds is null or 'agent' = any(p_kinds) then
    select coalesce(array_agg(k.event_id), '{}'::uuid[]) into v_kept_sweeps
      from clara._sweep_events_with_effect() k;
  else
    v_kept_sweeps := '{}'::uuid[];
  end if;

  with
  ev_base as (
    select
      v.event_id::text                                                    as id,
      'event'::text                                                       as source,
      v.event_type                                                        as event_type,
      v.event_description                                                 as description,
      v.client_id                                                         as client_id,
      v.actor                                                             as actor,
      v.on_behalf_of                                                      as on_behalf_of,
      v.via_wake_kind                                                     as via_wake_kind,
      v.created_at                                                        as occurred_at,
      v.object_kind                                                       as object_kind,
      v.object_id                                                         as object_id,
      orr.work_id                                                         as work_id,
      orr.id::text                                                        as receipt_id,
      case when v.object_kind = 'document' then v.object_id end           as document_id,
      case when v.object_kind = 'entry' then je.reversal_of end           as original_entry_id,
      case when v.object_kind = 'entry' then je.reversed_by end           as replacement_entry_id,
      case
        when v.object_kind <> 'entry' then null
        when je.status = 'approved' and je.reversed_by is not null then 'reversed'
        when je.status = 'approved' then 'approved'
        when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je.status = 'withdrawn' then 'withdrawn'
        else je.status
      end                                                                 as status,
      case
        -- #728 (C77.3): a sweep heartbeat is an AGENT ACT on the books, never a document act --
        -- checked FIRST, ahead of the untouched 0181 ladder below, because 'sweep.run_completed'
        -- matches none of those prefixes anyway and this keeps the one new rule visually apart
        -- from the three it does not change.
        when v.event_type = 'sweep.run_completed' then 'agent'
        when v.event_type like 'entry.%' then 'journal'
        when v.event_type like 'document.%' then 'documents'
        when v.event_type like 'close.%' then 'close'
        -- #630: `work.taken_over` is the estate's FIRST `work.%` event type (0184 §I). Without
        -- this arm the closed ladder's `else` files a handover under `documents`, where the
        -- `work` filter can never find it and the `documents` filter shows a row about no
        -- document at all. Matched on the PREFIX, not the one name, because the kind set is a
        -- closed vocabulary this door owns and every later `work.%` type belongs in the same
        -- bucket by construction.
        when v.event_type like 'work.%' then 'work'
        else 'documents'
      end                                                                 as kind
    from clara.firm_timeline_visible v
    left join clara.journal_entries je
      on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
    left join clara.operation_receipts orr
      on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
     -- Text comparison, not a uuid cast of the jsonb text expression: `ix_operation_receipts_entry`
     -- (0178:454-455) is built ON THE TEXT EXPRESSION `(effects->>'entry_id')`, and casting that
     -- expression to uuid before comparing defeats the index (the planner cannot match an
     -- expression index against a different expression on the same column, even a semantically
     -- equivalent one) -- cast the OTHER side instead, which is already a plain uuid column.
     and nullif(orr.effects->>'entry_id', '') = v.object_id::text
    -- #728: EXCLUDE a sweep heartbeat that changed nothing. `v_kept_sweeps` holds the receipts
    -- whose run actually drafted or posted something (clara._sweep_events_with_effect, read once
    -- above); a run that cannot be resolved at all contributes no id and is therefore treated the
    -- SAME as a zero-effect one -- an unverifiable heartbeat is not evidence of one, and is never
    -- shown by default. Every non-sweep row is untouched: the left side of the `or` is true for
    -- all of them, so this predicate can only ever remove sweep.run_completed rows, nothing else.
   where v.event_type <> 'sweep.run_completed' or v.event_id = any(v_kept_sweeps)
  ),
  ev as (
    select * from ev_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  ar_base as (
    select
      (r.receipt_kind || ':' || r.receipt_id)                             as id,
      'agent_receipt'::text                                               as source,
      null::text                                                          as event_type,
      null::text                                                          as description,
      r.client_id                                                         as client_id,
      r.acting_actor                                                      as actor,
      r.on_behalf_of                                                      as on_behalf_of,
      r.via_wake_kind                                                     as via_wake_kind,
      r.occurred_at                                                       as occurred_at,
      null::text                                                          as object_kind,
      null::uuid                                                          as object_id,
      null::uuid                                                          as work_id,
      (r.receipt_kind || ':' || r.receipt_id)                             as receipt_id,
      null::uuid                                                          as document_id,
      null::uuid                                                          as original_entry_id,
      null::uuid                                                          as replacement_entry_id,
      null::text                                                          as status,
      case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end as kind
    from clara.agent_receipts_visible r
  ),
  ar as (
    select * from ar_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  orx_base as (
    select
      orr.id::text                                                       as id,
      'operation_receipt'::text                                          as source,
      w.purpose                                                          as event_type,
      null::text                                                         as description,
      orr.client_id                                                      as client_id,
      orr.acting_actor                                                   as actor,
      orr.on_behalf_of                                                   as on_behalf_of,
      orr.via_wake_kind                                                  as via_wake_kind,
      orr.created_at                                                     as occurred_at,
      'entry'::text                                                      as object_kind,
      nullif(orr.effects->>'entry_id', '')::uuid                         as object_id,
      orr.work_id                                                        as work_id,
      orr.id::text                                                       as receipt_id,
      null::uuid                                                         as document_id,
      je2.reversal_of                                                    as original_entry_id,
      je2.reversed_by                                                    as replacement_entry_id,
      case
        when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
        when je2.status = 'approved' then 'approved'
        when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je2.status = 'withdrawn' then 'withdrawn'
        else je2.status
      end                                                                as status,
      'work'::text                                                       as kind
    from clara.operation_receipts orr
    left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
    left join clara.journal_entries je2
      -- Same index-preserving text comparison as the ev_base join above.
      on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
    where orr.firm_id = c.firm and orr.outcome = 'committed'
  ),
  orx as (
    select * from orx_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  unioned as (
    select * from ev union all select * from ar union all select * from orx
  )
  -- `jsonb_agg(to_jsonb(u.*))` with NO `order by` INSIDE the aggregate call is not guaranteed to
  -- respect the subquery's own `order by` -- an aggregate over a subquery may see its input rows
  -- in whatever order the planner chooses to feed them (a parallel worker, a different join
  -- strategy on a future replan), so the page and its `next_cursor` must never be minted from an
  -- order the aggregate itself did not pin. `order by u.occurred_at desc, u.id desc` INSIDE
  -- `jsonb_agg` makes that order part of the aggregate's own contract, not an incidental property
  -- borrowed from the subquery underneath it.
  select coalesce(jsonb_agg(to_jsonb(u.*) order by u.occurred_at desc, u.id desc), '[]'::jsonb) into v_all
    from (
      select * from unioned
       order by occurred_at desc, id desc
       limit v_limit + 1
    ) u;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    -- Same guarantee on the truncation slice: `ord` (the ordinality `jsonb_array_elements` mints
    -- over the ALREADY-ordered `v_all`) is projected back OUT to the aggregate's own `order by`
    -- rather than being dropped after the `where` filters on it -- the prior shape selected only
    -- `elem`, so the page these rows became had no aggregate-level order guarantee, only the
    -- current statement's plan happening to preserve one.
    select jsonb_agg(x.elem order by x.ord) into v_page
      from (
        select elem, ord from jsonb_array_elements(v_all) with ordinality as t(elem, ord)
         where ord <= v_limit
      ) x;
    v_last := v_page -> (v_limit - 1);
    v_next_cursor := encode(
      convert_to((v_last->>'occurred_at') || '|' || (v_last->>'id'), 'UTF8'), 'base64');
  else
    v_page := v_all;
    v_next_cursor := null;
  end if;

  return jsonb_build_object('rows', v_page, 'next_cursor', v_next_cursor, 'truncated', v_truncated);
end $$;

comment on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) is
  '#632 B5, recut #728, recut #630. The firm activity feed: a keyset-paged union of '
  'clara.firm_timeline_visible (domain events), clara.agent_receipts_visible (agent act receipts) '
  'and clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. #728: a sweep.run_completed event with no drafted '
  'effect is excluded entirely; one that drafted something is kind=agent (never documents), actor '
  'stays null. #630: a work.% event type (work.taken_over is the first) is kind=work, so a '
  'handover is findable under the filter that names it instead of falling into the documents '
  'bucket. PINS plan_cache_mode = force_custom_plan: its ONE union statement binds the session '
  'firm, every filter, the cursor pair and the kept-sweep array as plpgsql parameters, and from '
  'the sixth execution of a pooled connection plpgsql would otherwise serve it from a generic plan '
  'built for the per-firm AVERAGE of multi-tenant tables (measured: 145 ms -> 2.0-2.8 s at 30,000 '
  'committed operation_receipts with no sweep row at all, and 89 ms -> 1.7-2.5 s at 30,000 sweep '
  'receipts / 6,000 kept; flat with the clause). See 0183''s and 0181''s headers for the full '
  'rationale.';


create or replace function clara.get_activity_event(p_source text, p_id text) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  -- #728 (delta review round 4, BLOCKER [0]): FOR SYMMETRY, and measured. This door's series is
  -- flat today at the load that flips the feed (2.0 -> 0.9 ms at 30,000 receipts), but it binds
  -- the SAME session firm into the same three sources, and two halves of one surface that
  -- disagree about their own plan discipline are two halves someone later tidies the wrong way --
  -- the rule section 1 already states for the two helpers.
  set plan_cache_mode = force_custom_plan
as $$
declare
  c record;
  v_row jsonb;
  v_kind text;
  v_rid text;
  v_colon int;
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  if p_source is null or p_id is null or btrim(p_id) = '' then
    raise exception 'source and id are required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'activity_source_or_id_missing')::text;
  end if;

  if p_source = 'event' then
    select jsonb_build_object(
        'id', v.event_id::text, 'source', 'event', 'event_type', v.event_type,
        'description', v.event_description, 'client_id', v.client_id, 'actor', v.actor,
        'on_behalf_of', v.on_behalf_of, 'via_wake_kind', v.via_wake_kind, 'occurred_at', v.created_at,
        'object_kind', v.object_kind, 'object_id', v.object_id,
        'work_id', orr.work_id, 'receipt_id', orr.id::text,
        'document_id', case when v.object_kind = 'document' then v.object_id end,
        'original_entry_id', case when v.object_kind = 'entry' then je.reversal_of end,
        'replacement_entry_id', case when v.object_kind = 'entry' then je.reversed_by end,
        'status', case
          when v.object_kind <> 'entry' then null
          when je.status = 'approved' and je.reversed_by is not null then 'reversed'
          when je.status = 'approved' then 'approved'
          when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je.status = 'withdrawn' then 'withdrawn'
          else je.status
        end,
        'kind', case
          -- #728: same rule as list_activity's ev_base -- see that function's own comment.
          when v.event_type = 'sweep.run_completed' then 'agent'
          when v.event_type like 'entry.%' then 'journal'
          when v.event_type like 'document.%' then 'documents'
          when v.event_type like 'close.%' then 'close'
          -- #630: the same arm as list_activity's ev_base -- see that function's own comment.
          when v.event_type like 'work.%' then 'work'
          else 'documents'
        end,
        'client_name', cl.name
      ) into v_row
      from clara.firm_timeline_visible v
      left join clara.journal_entries je
        on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
      left join clara.operation_receipts orr
        on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
       -- Same index-preserving text comparison as list_activity's ev_base join.
       and nullif(orr.effects->>'entry_id', '') = v.object_id::text
      left join clara.clients cl on cl.id = v.client_id and cl.firm_id = c.firm
     where v.event_id::text = p_id;

    -- #728: the SAME exclusion list_activity applies -- a deep link to a zero-effect sweep
    -- heartbeat is dropped here, falls through to `v_row is null` below, and answers the SAME
    -- CLR11 activity_event_not_found every other denied/absent id already gets (no oracle: an
    -- excluded heartbeat must not read differently from one that never existed).
    --
    -- AFTER the row is fetched, not as another WHERE predicate beside `v.event_id::text = p_id`
    -- (native review, N1): a definer function in the WHERE is a filter the planner is free to
    -- order however it costs it, and one bad estimate would run it once per row of the whole
    -- timeline. Hoisted out like this it runs at most once per call, and only for a sweep receipt.
    -- It calls clara._sweep_event_has_effect, NOT the set form the feed calls: one cached plan per
    -- caller shape is the whole point of splitting them (0183 section 1, BLOCKER [0]).
    if v_row is not null and v_row ->> 'event_type' = 'sweep.run_completed'
       and not clara._sweep_event_has_effect((v_row ->> 'id')::uuid) then
      v_row := null;
    end if;

  elsif p_source = 'agent_receipt' then
    v_colon := position(':' in p_id);
    if v_colon < 2 or v_colon = length(p_id) then
      raise exception 'activity event not found' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
    end if;
    v_kind := substr(p_id, 1, v_colon - 1);
    v_rid := substr(p_id, v_colon + 1);
    select jsonb_build_object(
        'id', (r.receipt_kind || ':' || r.receipt_id), 'source', 'agent_receipt',
        'event_type', null, 'description', null, 'client_id', r.client_id,
        'actor', r.acting_actor, 'on_behalf_of', r.on_behalf_of, 'via_wake_kind', r.via_wake_kind,
        'occurred_at', r.occurred_at, 'object_kind', null, 'object_id', null,
        'work_id', null, 'receipt_id', (r.receipt_kind || ':' || r.receipt_id),
        'document_id', null, 'original_entry_id', null, 'replacement_entry_id', null,
        'status', null,
        'kind', case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end,
        'receipt_kind', r.receipt_kind, 'client_name', cl.name
      ) into v_row
      from clara.agent_receipts_visible r
      left join clara.clients cl on cl.id = r.client_id and cl.firm_id = c.firm
     where r.receipt_kind = v_kind and r.receipt_id = v_rid;

  elsif p_source = 'operation_receipt' then
    select jsonb_build_object(
        'id', orr.id::text, 'source', 'operation_receipt', 'event_type', w.purpose,
        'description', null, 'client_id', orr.client_id, 'actor', orr.acting_actor,
        'on_behalf_of', orr.on_behalf_of, 'via_wake_kind', orr.via_wake_kind,
        'occurred_at', orr.created_at, 'object_kind', 'entry',
        'object_id', nullif(orr.effects->>'entry_id', '')::uuid,
        'work_id', orr.work_id, 'receipt_id', orr.id::text, 'document_id', null,
        'original_entry_id', je2.reversal_of, 'replacement_entry_id', je2.reversed_by,
        'status', case
          when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
          when je2.status = 'approved' then 'approved'
          when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je2.status = 'withdrawn' then 'withdrawn'
          else je2.status
        end,
        'kind', 'work',
        'purpose', w.purpose, 'basis_origin', w.basis_origin, 'initiator', w.initiator,
        -- #630 -- TWO PEOPLE, TOLD APART, on the firm's only firm-wide history surface. 0184 §A
        -- split `clara.accounting_work.initiator` into the human the Work is EXECUTED AS (that
        -- column, which a handover moves) and the immutable `initiated_by` (who asked). 0181's
        -- lone `initiator` key therefore answers only the first question, and after a takeover it
        -- names the colleague beside an `on_behalf_of` that is also the colleague -- who asked is
        -- absent from the record entirely. ADDITIVE: `initiator` keeps its key and its value, so
        -- every existing reader is unbroken; `responsible` is the same fact under a name that
        -- says what it is, matching clara.list_entry_links' own triple (0184 §H2).
        'initiated_by', w.initiated_by, 'responsible', w.initiator,
        'client_name', cl.name
      ) into v_row
      from clara.operation_receipts orr
      left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
      left join clara.journal_entries je2
        -- Same index-preserving text comparison as list_activity's orx_base join.
        on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
      left join clara.clients cl on cl.id = orr.client_id and cl.firm_id = c.firm
     where orr.id::text = p_id and orr.firm_id = c.firm and orr.outcome = 'committed';

  else
    -- Folded into the SAME shared refusal below rather than raised here with its own distinct
    -- 'activity_source_unknown' reason -- this function's own comment already claims "an unknown
    -- source... refuse the SAME CLR11 activity_event_not_found", and a caller-visible SECOND
    -- reason token for the identical no-oracle situation would make that claim false. Leaving
    -- `v_row` at its declared NULL lets the common check right below raise the one shared refusal.
    v_row := null;
  end if;

  if v_row is null then
    raise exception 'activity event not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
  end if;
  return v_row;
end $$;

comment on function clara.get_activity_event(text, text) is
  '#632 B5, recut #728, recut #630. The detail record for one clara.list_activity row, addressed '
  'by (source, id) -- see that function''s own comment for the shapes. Another firm''s row, an '
  'unknown source, a malformed agent_receipt pair, a genuinely absent id, or an EXCLUDED '
  'zero-effect sweep heartbeat (#728) all refuse the SAME CLR11 activity_event_not_found (no '
  'oracle). #630: a work.% event type is kind=work (the same ladder as the feed), and the '
  'operation_receipt arm carries the Work''s provenance as THREE facts -- initiated_by (who '
  'asked, immutable), responsible (who it is executed as now) and initiator (the same human as '
  'responsible, under 0181''s original key, kept so no reader breaks). p_id is TEXT -- see this '
  'function''s header comment for why. Pins plan_cache_mode = force_custom_plan for symmetry with '
  'clara.list_activity rather than for a measurement of its own: it binds the same session firm '
  'into the same three sources, and its series was flat (2.0 -> 0.9 ms) at the load that flipped '
  'the feed.';

reset role;

-- =====================================================================================
-- §J  TAIL CENSUS. Every claim re-READ from the live catalog.
-- =====================================================================================
do $w630_tail$
declare v_src text; v_n int;
-- #630 (fourth review round) -- EVERY `v_src` BELOW IS THE BODY'S STATEMENTS, NOT ITS PROSE.
-- plpgsql `prosrc` carries the function's own comments, and a census that greps it can be
-- satisfied by a sentence ABOUT the code instead of the code. Measured here: the lock-order check
-- found `for key share` at prosrc offset 6493 -- inside the paragraph explaining why that lock is
-- taken -- and would have stayed green with the statement itself deleted. `clara._src_statements`
-- Each probe therefore reads `regexp_replace(prosrc, '--<to end of line>', '')` -- what the
-- function DOES, with what it says about itself removed. No new catalog object: the strip is the
-- SELECT's own expression.
begin
  -- The two new doors exist, are PUBLIC-revoked and reachable by clara_runtime ALONE.
  for v_src in select s from unnest(array[
      'clara.cancel_accounting_work(uuid,uuid,text)',
      'clara.take_over_accounting_work(uuid,uuid,text,text)']) s loop
    if to_regprocedure(v_src) is null then
      raise exception '#630 tail: % did not land', v_src using errcode='CLR10';
    end if;
    if not pg_catalog.has_function_privilege('clara_runtime', v_src, 'execute') then
      raise exception '#630 tail: clara_runtime cannot execute %', v_src using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_authenticated', v_src, 'execute')
       or pg_catalog.has_function_privilege('clara_wake_interactive', v_src, 'execute')
       or pg_catalog.has_function_privilege('clara_agent_ro', v_src, 'execute')
       or pg_catalog.has_function_privilege('public', v_src, 'execute') then
      raise exception '#630 tail: % is reachable by a role that must not hold it', v_src
        using errcode='CLR10';
    end if;
  end loop;

  -- The column, its NOT NULL, its default trigger, and the frozen set's SWAP.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work' and column_name='initiated_by'
     and is_nullable='NO';
  if v_n <> 1 then raise exception '#630 tail: initiated_by is missing or nullable' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.accounting_work where initiated_by is distinct from initiator;
  if v_n <> 0 then
    raise exception '#630 tail: the backfill left % row(s) whose initiated_by is not the initiator', v_n
      using errcode='CLR10';
  end if;
  -- THE SWAP IS ASSERTED ON THE ARRAY'S OWN TEXT, not on a bare name: `initiator` also appears in
  -- this body as the handover wall's `detail.column`, so a substring probe for it alone is true
  -- either way and would prove nothing.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  if position('''purpose'',''initiated_by'',''initiator_role''' in v_src) = 0 then
    raise exception '#630 tail: initiated_by is NOT in the frozen set -- history could be rewritten'
      using errcode='CLR10';
  end if;
  if position('''purpose'',''initiator'',''initiator_role''' in v_src) > 0 then
    raise exception '#630 tail: initiator is still in the frozen set -- the takeover could never move it'
      using errcode='CLR10';
  end if;
  if position('responsible_not_authorised' in v_src) = 0 then
    raise exception '#630 tail: the immutability recut lost the handover wall' using errcode='CLR10';
  end if;

  -- The four recuts carry their new arms AND the arms they must not have dropped.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('for update' in v_src)=0 or position('work_cancelled' in v_src)=0
     or position('work_settled' in v_src)=0 then
    raise exception '#630 tail: the commit recut lost one of its new arms' using errcode='CLR10';
  end if;
  if position('obo_not_initiator' in v_src)=0 or position('generic_control_leg' in v_src)=0
     or position('unknown_account' in v_src)=0 or position('basis_mismatch' in v_src)=0
     or position('operation_payload_conflict' in v_src)=0 or position('source_conflict' in v_src)=0
     or position('entry_evidence_links' in v_src)=0 or position('unique_violation' in v_src)=0
     or position('operation_in_flight' in v_src)=0 or position('wake_task_unbound' in v_src)=0 then
    raise exception '#630 tail: the commit recut dropped a 0178/0182 arm' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara.settle_work_run(uuid,text,text,jsonb,jsonb)'::regprocedure;
  if position('translated_by_cancel' in v_src)=0 or position('superseded' in v_src)=0
     or position('for update' in v_src)=0 then
    raise exception '#630 tail: the settle recut lost the cancel translation or the boundary lock'
      using errcode='CLR10';
  end if;
  if position('overridden_by_receipt' in v_src)=0 or position('_work_committed_receipt' in v_src)=0 then
    raise exception '#630 tail: the settle recut dropped 0178''s receipt override' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara.claim_work_run(uuid,text,jsonb)'::regprocedure;
  if position('for update' in v_src)=0 or position('invalid_bundle' in v_src)=0 then
    raise exception '#630 tail: the claim recut lost the boundary lock or a 0178 arm' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara._tf_accounting_work_status_mirror()'::regprocedure;
  if position('stopping' in v_src)=0 or position('_work_committed_receipt' in v_src)=0 then
    raise exception '#630 tail: the mirror recut lost stopping or the receipt arm' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara.work_authority_snapshot(uuid)'::regprocedure;
  if position('initiated_by' in v_src)=0 or position('initiator_authorised' in v_src)=0
     or position('responsible' in v_src)=0 then
    raise exception '#630 tail: the snapshot recut lost initiated_by, responsible or its deploy-locked alias'
      using errcode='CLR10';
  end if;

  -- #630 §A0 — the three private helpers exist and are granted to NOBODY.
  for v_src in select s from unnest(array[
      'clara._work_cancelled_error()',
      'clara._work_door_ctx(uuid,uuid,text,text,text,text)',
      'clara._converge_work_terminal(uuid,uuid,text)']) s loop
    if to_regprocedure(v_src) is null then
      raise exception '#630 tail: % did not land', v_src using errcode='CLR10';
    end if;
    if pg_catalog.has_function_privilege('public', v_src, 'execute')
       or pg_catalog.has_function_privilege('clara_runtime', v_src, 'execute')
       or pg_catalog.has_function_privilege('clara_authenticated', v_src, 'execute') then
      raise exception '#630 tail: private helper % is reachable by a role', v_src using errcode='CLR10';
    end if;
  end loop;

  -- #630 §H2 — THE LOCK ORDER IS GLOBAL. Both older doors reach clara.accounting_work BEFORE the
  -- task row, and each keeps the arm it must not have lost.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara.cancel_agent_task(uuid,text)'::regprocedure;
  if position('clara.accounting_work' in v_src) = 0 or position('for update' in v_src) = 0 then
    raise exception '#630 tail: cancel_agent_task does not take the Work row' using errcode='CLR10';
  end if;
  if position('clara.accounting_work' in v_src) > position('from clara.agent_tasks where id = p_task for update' in v_src) then
    raise exception '#630 tail: cancel_agent_task still locks the task before the Work' using errcode='CLR10';
  end if;
  if position('wakes_outbox' in v_src) = 0 or position('cancel_requested' in v_src) = 0 then
    raise exception '#630 tail: the cancel_agent_task recut dropped a 0133 arm' using errcode='CLR10';
  end if;
  -- …AND IT SAYS WHICH ARM ANSWERED. Without the discriminator a terminal settle of a queued turn
  -- and a no-op over a turn that had already ended are the same `{status:'cancelled'}`, and the
  -- only surface that reads this answer announced the first as the second.
  if position('''changed''' in v_src) = 0 or position('already_terminal' in v_src) = 0
     or position('already_requested' in v_src) = 0 then
    raise exception '#630 tail: cancel_agent_task answers no transition discriminator' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)'::regprocedure;
  if position('for no key update' in v_src) > position('set status = ''awaiting_input''' in v_src) then
    raise exception '#630 tail: open_work_question still locks the Work after the task transition'
      using errcode='CLR10';
  end if;
  if position('question_already_pending' in v_src) = 0 or position('hook_token_bound' in v_src) = 0 then
    raise exception '#630 tail: the open_work_question recut dropped a 0180 arm' using errcode='CLR10';
  end if;

  -- #630 §H2 — the credential mint TYPES its authority refusal, and the C3 provenance door tells
  -- the two people apart.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  if position('authority_lost' in v_src) = 0 or position('interactive_client' in v_src) = 0 then
    raise exception '#630 tail: the mint recut lost the typed refusal or a wake kind' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p where p.oid='clara.list_entry_links(uuid,uuid[])'::regprocedure;
  if position('initiated_by_role' in v_src) = 0 or position('''responsible''' in v_src) = 0 then
    raise exception '#630 tail: list_entry_links did not gain the split provenance' using errcode='CLR10';
  end if;
  if position('''initiator'',' in v_src) > 0 then
    raise exception '#630 tail: list_entry_links still emits the desynchronised pair' using errcode='CLR10';
  end if;
  if position('released_at' in v_src) = 0 or position('reversal_reason' in v_src) = 0 then
    raise exception '#630 tail: the list_entry_links recut dropped a 0182 field' using errcode='CLR10';
  end if;

  -- #630 — the boundary's SECOND half: the membership re-read inside the posting core is
  -- serialised with revocation, not merely fresh.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('for share' in v_src) = 0 then
    raise exception '#630 tail: the posting core does not hold the membership row against revocation'
      using errcode='CLR10';
  end if;
  -- …IN THE ESTATE'S ORDER. The revocation writers take clara.firms before the membership row, so
  -- this core must too, or the two deadlock (measured: wc.34's first cut).
  if position('for key share' in v_src) = 0
     or position('for key share' in v_src) > position('for share;' in v_src) then
    raise exception '#630 tail: the posting core reaches clara.firms after the membership row'
      using errcode='CLR10';
  end if;

  -- §I2 — THE ACTIVITY FEED'S TWO DOORS, recut from 0183's bodies. Both halves of each claim:
  -- what this file ADDED, and what 0183's body must not have lost under a full-body rewrite.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if position('like ''work.%'' then ''work''' in v_src) = 0 then
    raise exception '#630 tail: list_activity has no work.%% kind arm -- a handover would file under documents'
      using errcode='CLR10';
  end if;
  if position('v_kept_sweeps' in v_src) = 0
     or position('clara._sweep_events_with_effect()' in v_src) = 0 then
    raise exception '#630 tail: the list_activity recut dropped 0183''s kept-sweep set' using errcode='CLR10';
  end if;
  if position('''report''' in v_src) = 0 or position('like ''close.%''' in v_src) = 0 then
    raise exception '#630 tail: the list_activity recut dropped a 0181 kind arm' using errcode='CLR10';
  end if;
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc p
   where p.oid='clara.get_activity_event(text,text)'::regprocedure;
  if position('like ''work.%'' then ''work''' in v_src) = 0 then
    raise exception '#630 tail: get_activity_event has no work.%% kind arm -- the row and its deep link would disagree'
      using errcode='CLR10';
  end if;
  if position('''initiated_by'', w.initiated_by' in v_src) = 0
     or position('''responsible'', w.initiator' in v_src) = 0 then
    raise exception '#630 tail: get_activity_event does not project the split provenance -- who ASKED is absent from the firm''s history surface'
      using errcode='CLR10';
  end if;
  if position('''initiator'', w.initiator' in v_src) = 0 then
    raise exception '#630 tail: the get_activity_event recut DROPPED 0181''s initiator key -- the change must be additive'
      using errcode='CLR10';
  end if;
  if position('clara._sweep_event_has_effect(' in v_src) = 0
     or position('clara._sweep_events_with_effect(' in v_src) > 0 then
    raise exception '#630 tail: the get_activity_event recut lost 0183''s hoisted point lookup, or took the set form'
      using errcode='CLR10';
  end if;
  -- …and BOTH keep the two SET clauses 0183 pinned on them. proconfig, not prosrc: a `set` on the
  -- function header never appears in the body, so no textual probe can see it.
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure,
                   'clara.get_activity_event(text,text)'::regprocedure)
     and coalesce(p.proconfig, '{}'::text[]) @> array['plan_cache_mode=force_custom_plan',
                                                     'search_path=clara, pg_temp'];
  if v_n <> 2 then
    raise exception '#630 tail: an Activity door lost plan_cache_mode=force_custom_plan or its pinned search_path (% of 2 carry both)', v_n
      using errcode='CLR10';
  end if;
  -- …and neither gained a grant it must not have. 0183 left both clara_authenticated-only.
  if pg_catalog.has_function_privilege('public', 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)', 'execute')
     or pg_catalog.has_function_privilege('public', 'clara.get_activity_event(text,text)', 'execute')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)', 'execute')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara.get_activity_event(text,text)', 'execute') then
    raise exception '#630 tail: create-or-replace did not preserve 0183''s grants on the Activity doors'
      using errcode='CLR10';
  end if;

  -- The timeline type is registered AND routed at the active version.
  select count(*)::int into v_n from clara.event_types where name='work.taken_over';
  if v_n <> 1 then raise exception '#630 tail: work.taken_over is not registered' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version=(select version from clara.taxonomy_active) and tt.event_type='work.taken_over';
  if v_n <> 1 then raise exception '#630 tail: work.taken_over is not routed' using errcode='CLR10'; end if;

  raise notice '#630 tail: OK -- clara.cancel_accounting_work and clara.take_over_accounting_work are PUBLIC-revoked and clara_runtime-only; clara.accounting_work.initiated_by is NOT NULL, equal to initiator on every existing row and now the frozen historical fact while initiator became the mutable authority column behind a bookkeeper wall; the posting core takes the Work row lock and refuses work_cancelled/work_settled with every 0178/0182 arm intact; settle_work_run locks the Work first and translates a cancel_requested settle to cancelled under error.superseded while the receipt still overrides; claim_work_run and the status mirror take the same order and the mirror writes stopping; and work.taken_over is registered and routed at the active taxonomy version. clara.cancel_agent_task additionally answers a changed/transition discriminator on EVERY arm (cancel_requested | cancelled | already_terminal | already_requested), so a press that terminally cancelled a queued turn is distinguishable from one that found the turn already over; clara.list_activity and clara.get_activity_event are recut from 0183''s own bodies with a work.%% kind arm and, on the detail door, initiated_by/responsible beside the unchanged initiator, both still pinned to plan_cache_mode=force_custom_plan and clara_authenticated-only; and every prosrc probe in this census reads the body with its `--` comment tails stripped, so no assertion here can be satisfied by prose about the code.';
end
$w630_tail$;
