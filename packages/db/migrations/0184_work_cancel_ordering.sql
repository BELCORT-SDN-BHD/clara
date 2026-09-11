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
--   clara._record_journal_entry_core  work FOR UPDATE (the task is only FK-referenced)
--   clara.settle_work_run             work FOR UPDATE first — RECUT HERE for exactly this reason:
--                                     it used to update `agent_tasks` and THEN
--                                     `clara.accounting_work`, i.e. task → work, which is the
--                                     inverse of the boundary and a deadlock against every cancel.
--   clara.claim_work_run              work FOR UPDATE first — recut for the same reason.
--
-- ONE INVERSION SURVIVES AND IS NAMED RATHER THAN HIDDEN: `clara.cancel_agent_task` (0133:567) is
-- the ESTATE's own task-level door and this file does not edit it — it locks the TASK first, and
-- the status mirror recut below then writes the Work. A Work-level cancel racing a task-level
-- cancel of the SAME Work can therefore deadlock; PostgreSQL detects it, one side raises 40P01,
-- and both callers already treat 40P01 as transient (claraWork.v1.errors.ts's
-- PG_TRANSIENT_SQLSTATES, and the route's own retry). The alternative — editing the estate's cancel
-- door to lock a table it knows nothing about — would put `clara.accounting_work` inside a verb
-- that must keep working on databases where that relation does not exist.
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
-- THE THIRD MEASUREMENT: `initiator` CANNOT CARRY RESPONSIBILITY, BECAUSE IT IS IMMUTABLE.
--
-- Story 29 asks that a currently authorised colleague be able to take responsibility for a Work
-- whose initiator lost authority. `clara.accounting_work.initiator` is frozen by
-- `clara._tf_accounting_work_immutable` and must stay frozen: it is the estate's record of WHO
-- ASKED, read off the posted entry by a reviewer months later. So responsibility becomes its own
-- column, `responsible`, born equal to `initiator` and moved by exactly one door.
--
-- `clara._record_journal_entry_core`'s obo binding and `clara.work_authority_snapshot` both switch
-- to `responsible`, because the credential names the human whose LIVE authority is being spent.
-- `initiator` keeps every attribution role it had. The refusal reason for a mismatched credential
-- stays `obo_not_initiator` — the frozen roster knows that token and a rename would make the run
-- classify its own refusal as unmapped.
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
   where table_schema='clara' and table_name='accounting_work' and column_name='responsible';
  if v_n <> 0 then
    raise exception '#630 prestate: clara.accounting_work.responsible already exists' using errcode='CLR10';
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
  raise notice '#630 prestate: clean -- no work-level cancel or takeover door exists, accounting_work has no responsible column, the posting core takes no row lock and knows no cancellation, and the status mirror never writes stopping.';
end
$w630_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.accounting_work.responsible — WHO IS ANSWERABLE FOR THIS WORK NOW.
--
-- Born equal to `initiator` for every existing row and for every future admission (the default
-- trigger below), so nothing about the lane changes until a takeover moves it. It is deliberately
-- NOT added to `clara._tf_accounting_work_immutable`'s frozen set: the takeover door is its one
-- writer and the column has to be able to move.
-- =====================================================================================
alter table clara.accounting_work add column responsible uuid references clara.users(id);
-- The backfill runs with the immutability trigger DISABLED for one statement. Not to dodge the
-- trigger's check (nothing frozen moves) but to keep `updated_at` HONEST: that trigger stamps
-- `new.updated_at := now()` on every update, and a schema backfill is not a thing that happened to
-- the Work. Re-enabled immediately; both statements are inside this migration's single transaction.
alter table clara.accounting_work disable trigger t_accounting_work_immutable;
update clara.accounting_work set responsible = initiator where responsible is null;
alter table clara.accounting_work enable trigger t_accounting_work_immutable;
alter table clara.accounting_work alter column responsible set not null;

comment on column clara.accounting_work.responsible is
  '#630: the human whose LIVE authority this Work is executed under. Equal to `initiator` until '
  'clara.take_over_accounting_work moves it. `initiator` stays the immutable record of who asked.';

-- The default. A column DEFAULT cannot read another column, and recutting
-- `clara.admit_journal_work` purely to add one assignment would put a 160-line body under review
-- for a line that belongs to the table. A BEFORE INSERT trigger states the invariant once, for
-- every writer that will ever exist. It reads NO clock.
create function clara._tf_accounting_work_responsible_default() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.responsible is null then new.responsible := new.initiator; end if;
  return new;
end $$;
revoke all on function clara._tf_accounting_work_responsible_default() from public;
create trigger t_accounting_work_responsible_default before insert on clara.accounting_work
  for each row execute function clara._tf_accounting_work_responsible_default();

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
  if v_receipt is null then return null; end if;
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
  perform 1 from clara.accounting_work w where w.id = t.work_id for update;
  select * into t from clara.agent_tasks at where at.id = p_task;

  if t.status in ('completed','failed','cancelled','expired') then
    return jsonb_build_object('work_id', t.work_id, 'task_id', p_task,
      'task_status', t.status,
      'status', (select w.status from clara.accounting_work w where w.id = t.work_id),
      'requested_outcome', p_outcome, 'overridden_by_receipt', false,
      'translated_by_cancel', false,
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
  if v_receipt is null and t.status = 'cancel_requested' and v_outcome <> 'cancelled' then
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
    else jsonb_build_object(
           'code', 'cancelled', 'reason', 'cancelled',
           'message', 'This Work was cancelled before an entry was recorded. Nothing was posted.',
           'recoverable', true,
           'superseded', jsonb_build_object('outcome', v_translated,
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
    'replayed', false);
end $$;
revoke all on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) from public;
grant execute on function clara.settle_work_run(uuid,text,text,jsonb,jsonb) to clara_runtime;

-- =====================================================================================
-- §E  clara.work_authority_snapshot — RECUT. The liveness it reports is the RESPONSIBLE human's.
--
-- The frozen `recheckAuthorityStep` (claraWork.v2.impl.ts) reads `initiator_active`,
-- `initiator_authorised` and `initiator_role` to decide whether a resumed run may continue. After a
-- takeover the run acts under the COLLEAGUE's authority, so those three keys must describe the
-- colleague or the takeover's new run would die on its first resume under an authority it never
-- used. The key NAMES cannot change (the reader is deploy-locked), so they keep their names and
-- this comment — plus the explicit `responsible*` keys added beside them — carries the meaning.
-- `initiator` itself is untouched and still names who asked. A v3 closure should read the
-- `responsible*` keys and retire the `initiator_*` aliases.
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
    'responsible', w.responsible,
    'responsible_role', m.role,
    'responsible_active', (m.status = 'active'),
    'responsible_authorised',
      coalesce(m.status = 'active' and clara.role_rank(m.role) >= clara.role_rank('bookkeeper'), false),
    -- The deploy-locked aliases. Same three values, under the names the frozen closure reads.
    'initiator_role', m.role,
    'initiator_active', (m.status = 'active'),
    'initiator_authorised',
      coalesce(m.status = 'active' and clara.role_rank(m.role) >= clara.role_rank('bookkeeper'), false))
  from clara.agent_tasks t
  join clara.accounting_work w on w.id = t.work_id
  join clara.clients cl on cl.id = w.client_id
  left join clara.firm_memberships m on m.firm_id = w.firm_id and m.user_id = w.responsible
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
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
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
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
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
  -- #630 · IT BINDS `responsible`, NOT `initiator`. Until a takeover the two are the same column
  -- value, so nothing changes for any Work admitted before this migration. After one, the credential
  -- that may spend authority is the COLLEAGUE's -- that is the whole point of story 29 -- while
  -- `initiator` stays the immutable record of who asked. The reason token is unchanged on purpose:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster, and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.responsible then
    raise exception 'this operation is bound to the human responsible for it; the credential names another'
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
-- FOUR ANSWERS, and the order they are asked in IS the contract:
--   1. the Work already settled            -> {cancelled:false, reason:'already_terminal'}   (no raise)
--   2. a committed receipt exists          -> settle `completed`; {reason:'already_completed'}
--   3. the run has not started (queued)    -> terminal `cancelled` through clara.settle_work_run
--   4. the run is live (running/parked)    -> task `cancel_requested`, Work `stopping`, NOTIFY
-- =====================================================================================
create function clara.cancel_accounting_work(p_work uuid, p_author uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_dedupe jsonb;
  v_receipt jsonb; v_result jsonb; v_cancelled_at timestamptz;
  -- The current run is held in SCALARS rather than a record: `w.current_task_id` is nullable
  -- (nothing in the schema requires a Work to have a run), and an unassigned plpgsql record raises
  -- on its first field reference instead of reading NULL.
  v_task uuid; v_task_status text; v_task_cancelled_by uuid; v_task_cancelled_at timestamptz;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a cancel requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into w from clara.accounting_work aw where aw.id = p_work;
  if not found then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  -- NO EXISTENCE ORACLE: a non-member and an absent Work answer identically.
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = w.firm_id
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
    raise exception 'cancelling accounting work requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(w.firm_id, 'cancel_accounting_work', p_op_key,
      clara._hash(jsonb_build_object('work', p_work, 'author', p_author)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args", re-raised WITH a detail so
    -- every refusal this door emits carries (errcode, detail.reason) — the answer_work_question
    -- precedent (0180).
    raise exception 'this op key was already used for a different cancel' using errcode='CLR10',
      detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this cancel key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- THE BOUNDARY. accounting_work -> agent_tasks -> agent_interruptions, in that order, and the
  -- FIRST lock is the same row clara._record_journal_entry_core takes. Everything below reads a
  -- world that cannot move under it.
  select * into w from clara.accounting_work aw where aw.id = p_work for update;
  if w.current_task_id is not null then
    select at.id, at.status, at.cancelled_by, at.cancelled_at
      into v_task, v_task_status, v_task_cancelled_by, v_task_cancelled_at
      from clara.agent_tasks at where at.id = w.current_task_id for update;
  end if;

  -- 1 · ALREADY TERMINAL. A double cancel is not an error: the human's intent is already true.
  if w.status in ('completed','refused','failed','cancelled','expired') then
    v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
      'status', w.status, 'cancelled', false, 'reason', 'already_terminal', 'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  -- 2 · THE OPERATION ALREADY WON. A cancel does NOT reverse a posted entry (ARCHITECTURE §6,
  -- "取消不冲销已入账结果"); a correction is a separate, explicitly linked operation. The Work is
  -- completed by its receipt, and the answer names the effect so the surface can link to it.
  v_receipt := clara._work_committed_receipt(p_work);
  if v_receipt is not null then
    if v_task is not null and v_task_status not in ('completed','failed','cancelled','expired') then
      perform clara.settle_work_run(v_task, 'completed', null, null, v_receipt);
    end if;
    perform clara._audit(w.firm_id, p_author, null, null, 'cancel_accounting_work', null,
      jsonb_build_object('work', p_work, 'task', w.current_task_id, 'op_key', p_op_key,
        'outcome', 'already_completed', 'receipt', v_receipt));
    v_result := jsonb_build_object('work_id', p_work, 'task_id', w.current_task_id,
      'status', 'completed', 'cancelled', false, 'reason', 'already_completed',
      'receipt_id', v_receipt->>'receipt_id', 'entry_id', v_receipt->>'entry_id',
      'replayed', false);
    return clara._finish_op(w.firm_id, 'cancel_accounting_work', p_op_key, v_result);
  end if;

  -- 3 · ALREADY STOPPING. The abort is requested and the run is settling; asking twice changes
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
    -- 4 · NO ENGINE RUN. Nothing to abort, so the terminal is reached now — through
    -- clara.settle_work_run, because ONE verb writes this lane's terminals and a second writer is
    -- how a task row and a Work row come to disagree.
    if v_task is not null then
      perform clara.settle_work_run(v_task, 'cancelled', null,
        jsonb_build_object('code','cancelled','reason','cancelled',
          'message','This Work was cancelled before an entry was recorded. Nothing was posted.',
          'recoverable', true), null);
    else
      update clara.accounting_work
         set status = 'cancelled',
             error = jsonb_build_object('code','cancelled','reason','cancelled',
               'message','This Work was cancelled before an entry was recorded. Nothing was posted.',
               'recoverable', true)
       where id = p_work;
    end if;
  else
    -- 5 · A LIVE ENGINE RUN. The cancel is a REQUEST: the runtime aborts the run and then settles
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
  w record; v_role text; v_member_status text; v_dedupe jsonb;
  v_resp_role text; v_resp_status text; v_resp_authorised boolean;
  v_live text; v_retry jsonb; v_previous uuid; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a takeover requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into w from clara.accounting_work aw where aw.id = p_work;
  if not found then
    raise exception 'accounting work not found in your firm' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = w.firm_id
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
    raise exception 'taking responsibility for accounting work requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(w.firm_id, 'take_over_accounting_work', p_op_key,
      clara._hash(jsonb_build_object('work', p_work, 'author', p_author)));
  exception when sqlstate 'CLR10' then
    raise exception 'this op key was already used for a different takeover' using errcode='CLR10',
      detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this takeover key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- THE BOUNDARY, same first lock as every other writer in this lane.
  select * into w from clara.accounting_work aw where aw.id = p_work for update;
  v_previous := w.responsible;

  -- IS IT TAKEABLE? Terminal AND orphaned. "Orphaned" is re-read NOW rather than taken from the
  -- stored error: a Work refused `authority_lost` whose human has since been reinstated is theirs
  -- again, and a Work that failed for another reason is still takeable once its human is gone.
  select m.role, m.status into v_resp_role, v_resp_status from clara.firm_memberships m
   where m.user_id = w.responsible and m.firm_id = w.firm_id
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  v_resp_authorised := coalesce(v_resp_status = 'active'
    and clara.role_rank(v_resp_role) >= clara.role_rank('bookkeeper'), false);
  if w.status not in ('refused','failed','expired')
     or (v_resp_authorised
         and coalesce(w.error->>'reason','') is distinct from 'authority_lost') then
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

  -- THE EFFECT, in this order: responsibility first, so the new run is created under the human who
  -- will actually execute it.
  update clara.accounting_work set responsible = p_author where id = p_work;

  perform clara._audit(w.firm_id, p_author, null, null, 'take_over_accounting_work', null,
    jsonb_build_object('work', p_work, 'op_key', p_op_key, 'from_status', w.status,
      'previous_responsible', v_previous, 'initiator', w.initiator,
      'logical_op_id', w.logical_op_id));
  perform clara._append_event(w.firm_id, 'work.taken_over', w.client_id, p_author, null, null,
    null, null, null,
    jsonb_build_object('work', p_work, 'previous_responsible', v_previous,
      'new_responsible', p_author, 'initiator', w.initiator, 'from_status', w.status,
      'logical_op_id', w.logical_op_id));

  -- ONE CODE PATH FOR RUN CREATION. `clara.retry_accounting_work` mints the task, repoints
  -- `current_task_id`, clears the previous attempt's error/result and writes its own audit row.
  v_retry := clara.retry_accounting_work(p_work, p_author, 'takeover:' || p_op_key);

  v_result := jsonb_build_object('work_id', p_work, 'task_id', v_retry->>'task_id',
    'logical_op_id', w.logical_op_id, 'status', v_retry->>'status',
    'responsible', p_author, 'previous_responsible', v_previous, 'initiator', w.initiator,
    'taken_over', true, 'replayed', false);
  return clara._finish_op(w.firm_id, 'take_over_accounting_work', p_op_key, v_result);
end $$;
revoke all on function clara.take_over_accounting_work(uuid,uuid,text,text) from public;
grant execute on function clara.take_over_accounting_work(uuid,uuid,text,text) to clara_runtime;
comment on function clara.take_over_accounting_work(uuid,uuid,text,text) is
  '#630 story 29. A currently authorised colleague takes responsibility for a terminal Work whose '
  'responsible human lost authority. Moves clara.accounting_work.responsible (never `initiator`), '
  'records a work.taken_over timeline event, and creates the new run through '
  'clara.retry_accounting_work so there is ONE code path for run creation.';

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
-- §J  TAIL CENSUS. Every claim re-READ from the live catalog.
-- =====================================================================================
do $w630_tail$
declare v_src text; v_n int;
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

  -- The column, its NOT NULL, its default trigger and its ABSENCE from the frozen set.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work' and column_name='responsible'
     and is_nullable='NO';
  if v_n <> 1 then raise exception '#630 tail: responsible is missing or nullable' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.accounting_work where responsible is distinct from initiator;
  if v_n <> 0 then
    raise exception '#630 tail: the backfill left % row(s) whose responsible is not the initiator', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  if position('responsible' in v_src) > 0 then
    raise exception '#630 tail: responsible is in the FROZEN set -- the takeover could never move it'
      using errcode='CLR10';
  end if;

  -- The four recuts carry their new arms AND the arms they must not have dropped.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('for update' in v_src)=0 or position('work_cancelled' in v_src)=0
     or position('work_settled' in v_src)=0 or position('w.responsible' in v_src)=0 then
    raise exception '#630 tail: the commit recut lost one of its new arms' using errcode='CLR10';
  end if;
  if position('obo_not_initiator' in v_src)=0 or position('generic_control_leg' in v_src)=0
     or position('unknown_account' in v_src)=0 or position('basis_mismatch' in v_src)=0
     or position('operation_payload_conflict' in v_src)=0 or position('source_conflict' in v_src)=0
     or position('entry_evidence_links' in v_src)=0 or position('unique_violation' in v_src)=0
     or position('operation_in_flight' in v_src)=0 or position('wake_task_unbound' in v_src)=0 then
    raise exception '#630 tail: the commit recut dropped a 0178/0182 arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.settle_work_run(uuid,text,text,jsonb,jsonb)'::regprocedure;
  if position('translated_by_cancel' in v_src)=0 or position('superseded' in v_src)=0
     or position('for update' in v_src)=0 then
    raise exception '#630 tail: the settle recut lost the cancel translation or the boundary lock'
      using errcode='CLR10';
  end if;
  if position('overridden_by_receipt' in v_src)=0 or position('_work_committed_receipt' in v_src)=0 then
    raise exception '#630 tail: the settle recut dropped 0178''s receipt override' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_work_run(uuid,text,jsonb)'::regprocedure;
  if position('for update' in v_src)=0 or position('invalid_bundle' in v_src)=0 then
    raise exception '#630 tail: the claim recut lost the boundary lock or a 0178 arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_accounting_work_status_mirror()'::regprocedure;
  if position('stopping' in v_src)=0 or position('_work_committed_receipt' in v_src)=0 then
    raise exception '#630 tail: the mirror recut lost stopping or the receipt arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.work_authority_snapshot(uuid)'::regprocedure;
  if position('w.responsible' in v_src)=0 or position('initiator_authorised' in v_src)=0 then
    raise exception '#630 tail: the snapshot recut lost responsible or its deploy-locked alias'
      using errcode='CLR10';
  end if;

  -- The timeline type is registered AND routed at the active version.
  select count(*)::int into v_n from clara.event_types where name='work.taken_over';
  if v_n <> 1 then raise exception '#630 tail: work.taken_over is not registered' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version=(select version from clara.taxonomy_active) and tt.event_type='work.taken_over';
  if v_n <> 1 then raise exception '#630 tail: work.taken_over is not routed' using errcode='CLR10'; end if;

  raise notice '#630 tail: OK -- clara.cancel_accounting_work and clara.take_over_accounting_work are PUBLIC-revoked and clara_runtime-only; clara.accounting_work.responsible is NOT NULL, equal to initiator on every existing row and absent from the frozen set; the posting core takes the Work row lock and refuses work_cancelled/work_settled with every 0178/0182 arm intact; settle_work_run locks the Work first and translates a cancel_requested settle to cancelled under error.superseded while the receipt still overrides; claim_work_run and the status mirror take the same order and the mirror writes stopping; and work.taken_over is registered and routed at the active taxonomy version.';
end
$w630_tail$;
