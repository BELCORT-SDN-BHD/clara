-- 0199_work_cancelled_event — #750: A CANCELLED WORK LEAVES AN ATTRIBUTABLE ROW ON THE FEED.
-- =====================================================================================
-- Spec of record: issue #750 (body of 2026-09-12 and the Agent Brief comment of 2026-09-13).
-- Domain words: CONTEXT.md — "Accounting work", "Activity feed". ARCHITECTURE §5 (the Work /
-- accounting-work paragraph) records the cancel door and this file's addition to it.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.cancel_accounting_work` (0184 §G) writes its
-- audit trail under `_reserve_op`/`_finish_op` and appends NO domain event, so the Activity feed's
-- `work` kind arm has exactly one producer (`work.taken_over`, 0184 §I) and a human cancelling a
-- Work leaves the firm's only firm-wide history surface silent; this file registers
-- `work.cancelled` at the ACTIVE taxonomy version and emits EXACTLY ONE such event from the two
-- arms of that door that actually cancel something.
--
-- =====================================================================================
-- TWO ARMS EMIT, FOUR DO NOT, AND THE SPLIT IS THE TICKET'S OWN.
--
-- 0184 §G answers six questions in a fixed order. The four that report "nothing happened" —
-- `already_completed` (arm 1), `already_terminal` (arms 2 and 3) and `already_stopping` (arm 4) —
-- append nothing: an event is a record that something CHANGED, and a feed that carried a row every
-- time somebody pressed Cancel twice would be counting presses, not acts. The two arms that DO
-- change the world are:
--
--   * arm 5 — no engine run: the Work reaches the terminal `cancelled` now;
--   * arm 6 — a live engine run: the task takes `cancel_requested`, the Work reads `stopping`.
--
-- Both leave the door through ONE shared tail (the audit row and the `cancelled:true` answer), and
-- the emission sits in that tail — so "exactly one event per cancel that cancelled something" is
-- structural rather than a property two copies have to keep agreeing about. A cancel that is
-- REPLAYED under the same op key returns from `clara._work_door_ctx`'s dedupe branch long before
-- this point, so a replay appends nothing either.
--
-- THE PAYLOAD IS {work, from_status, author, outcome, superseded_by}.
--   * `work`         — the Work id. `clara.list_activity`'s ev_base reads exactly this key to
--                      deep-link a `work.%` row (0184 §I2), and the uuid shape it probes for is
--                      what this writes.
--   * `from_status`  — the Work's status BEFORE the cancel, read off the row this door locked at
--                      its top. Arm 5 and arm 6 are distinguishable from it without the reader
--                      having to know the door's arm numbering.
--   * `author`       — who pressed Cancel. `_append_event`'s own `actor` column carries the same
--                      value, so the feed attributes the row without reading the payload at all;
--                      the key is here because the payload is the durable record a later reader
--                      diffs, and half a fact is worse than two copies of one.
--   * `outcome`      — 'cancelled', or 'superseded' when the Work is being retired in favour of a
--                      successor (#721).
--   * `superseded_by`— the successor Work, or jsonb null.
--
-- THE TWO SUCCESSOR KEYS ARE READ FORWARD-COMPATIBLY, and that is deliberate rather than clever.
-- `clara.accounting_work.superseded_by` does not exist at this frontier; #721 adds it (0200). The
-- body below reads it as `to_jsonb(w)->'superseded_by'` — a jsonb projection of the row record the
-- door ALREADY holds — which is SQL NULL while the column is absent and the column's value once it
-- exists. So this file emits `superseded_by: null` on every cancel today, #721's restate door gets
-- its link into the SAME event by stamping the column before it calls this door, and
-- `cancel_accounting_work` is recut ONCE rather than twice. A door this lane calls a "live-writer
-- recut" is not something to do twice in one batch for a key that is null in between.
--
-- NO SIBLING `work.superseded` TYPE (#721's ruling of 2026-09-12, point 3): one producer, one
-- type. The outcome is a payload member, not a second name for the same act.
--
-- =====================================================================================
-- DEPLOY ORDER. NO CONSUMER-FIRST OBLIGATION.
--   * the door's SIGNATURE, GRANT, RETURN SHAPE and every ANSWER are untouched, so a runtime or a
--     web image ahead of or behind this file calls it unchanged;
--   * the feed's two doors need NO recut: 0184 §I2 matched `work.%` on the PREFIX for exactly this
--     reason ("every later `work.%` type belongs in the same bucket by construction"), and the
--     deep-link CASE reads `payload->>'work'` behind a uuid-shape probe;
--   * `clara.event_types`'s coverage law (rig-docs-events §3.7) requires the ACTIVE taxonomy to
--     route every catalog row, so the registration and the routing ship in one statement pair —
--     the same shape 0184 §I used.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE THAT IS NEW.
-- `clara.cancel_accounting_work` keeps exactly the refusals `clara._work_door_ctx` raises for it
-- (work_not_found / actor_not_active / insufficient_role / invalid_op_key / op_key_conflict /
-- operation_in_flight) and adds none.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w750_pre$
declare n text; v_src text; v_n int; v_sha text; v_missing text;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form.
  foreach n in array array[
    'clara.cancel_accounting_work(uuid,uuid,text)',
    'clara._work_door_ctx(uuid,uuid,text,text,text,text)',
    'clara._work_committed_receipt(uuid)',
    'clara._converge_work_terminal(uuid,uuid,text)',
    'clara._work_cancelled_error()',
    'clara.settle_work_run(uuid,text,text,jsonb,jsonb)',
    'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._finish_op(uuid,text,text,jsonb)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#750 prestate: prerequisite absent: % (migration 0184 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the catalog this file inserts into, and the ACTIVE taxonomy pointer it routes at.
  if to_regclass('clara.event_types') is null or to_regclass('clara.trigger_taxonomy') is null
     or to_regclass('clara.taxonomy_active') is null then
    raise exception '#750 prestate: the event taxonomy tables are absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.taxonomy_active) then
    raise exception '#750 prestate: no active taxonomy version is pointed at' using errcode='CLR10';
  end if;

  -- 0.3 · `work.cancelled` IS NOT ALREADY REGISTERED. A second registration would be this file
  -- silently re-describing somebody else's type.
  select count(*)::int into v_n from clara.event_types where name = 'work.cancelled';
  if v_n <> 0 then
    raise exception '#750 prestate: work.cancelled is ALREADY registered -- this file has nothing to add'
      using errcode='CLR10';
  end if;

  -- 0.4 · 0184 §I's type is still the estate's ONLY `work.%` type, and it is still routed. The
  -- taxonomy-count pin 0184's own tail carries, re-measured here at the frontier this file edits.
  select count(*)::int into v_n from clara.event_types where name like 'work.%';
  if v_n <> 1 then
    raise exception '#750 prestate: expected exactly 1 work.%% event type (work.taken_over); found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version = (select version from clara.taxonomy_active) and tt.event_type like 'work.%';
  if v_n <> 1 then
    raise exception '#750 prestate: expected exactly 1 routed work.%% type at the active taxonomy version; found %', v_n
      using errcode='CLR10';
  end if;

  -- 0.5 · EXACTLY ONE body of the door, and it is 0184's — measured by sha-256 over the INSTALLED
  -- prosrc, not assumed from a file listing. This file is a FULL-BODY recut derived from that
  -- text; if a later migration recut the door first, the derivation is stale and the recut would
  -- silently drop that migration's work.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='cancel_accounting_work';
  if v_n <> 1 then
    raise exception '#750 prestate: clara.cancel_accounting_work has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid = 'clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure;
  if v_sha <> 'bfd9f7bef776466b0a793f14faa4c95d4180ea425bc5a433fe50bb5dc73d4799' then
    raise exception '#750 prestate: the live clara.cancel_accounting_work is NOT 0184 §G''s body (prosrc sha256 %) -- this file''s recut is derived from that text and must not be applied over a different one', v_sha
      using errcode='CLR10';
  end if;

  -- 0.6 · …and it appends NO event today. The literal probe this whole file exists for.
  if position('_append_event' in v_src) <> 0 then
    raise exception '#750 prestate: the live clara.cancel_accounting_work ALREADY appends an event'
      using errcode='CLR10';
  end if;
  v_missing := '';
  if position('clara._work_door_ctx(' in v_src) = 0 then v_missing := v_missing || ' door-preamble'; end if;
  if position('for update' in v_src) = 0 then v_missing := v_missing || ' work-row-lock'; end if;
  if position('already_completed' in v_src) = 0 then v_missing := v_missing || ' arm1'; end if;
  if position('already_terminal' in v_src) = 0 then v_missing := v_missing || ' arm2-3'; end if;
  if position('already_stopping' in v_src) = 0 then v_missing := v_missing || ' arm4'; end if;
  if position('clara.settle_work_run(' in v_src) = 0 then v_missing := v_missing || ' arm5-settle'; end if;
  if position('''cancel_requested''' in v_src) = 0 then v_missing := v_missing || ' arm6-request'; end if;
  if v_missing <> '' then
    raise exception '#750 prestate: the live clara.cancel_accounting_work is missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  raise notice '#750 prestate: clean -- clara.cancel_accounting_work exists exactly once, carries 0184 §G''s body verbatim (prosrc sha256 pinned) with all six arms and appends no domain event; work.cancelled is unregistered; work.taken_over is still the estate''s only work.%% type and is routed at the active taxonomy version.';
end
$w750_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §I  THE TIMELINE TYPE. Registered at the ACTIVE taxonomy version in the SAME migration that
-- first emits it — `clara.event_types`' coverage law (rig-docs-events §3.7) requires the active
-- taxonomy to route EVERY catalog row, so shipping the pair together is the only shape that never
-- leaves the anti-join non-empty for even one migration. 0184 §I's shape, verbatim.
--
-- `ignore`: a cancellation retires an INTENT. It changes who is answerable for a Work and whether
-- it will ever post, and it changes no accounting fact Clara's context pack reads — the books are
-- untouched by construction (0184 §G arm 1: a Work holding a committed receipt is never cancelled).
-- =====================================================================================
insert into clara.event_types(name, client_scoped, description)
  values ('work.cancelled', true,
          'A human cancelled accounting work before it posted');
insert into clara.trigger_taxonomy(version, event_type, decision, note)
  select ta.version, 'work.cancelled', 'ignore',
         '#750: a cancellation retires an intent; the books are untouched (a Work holding a committed receipt is never cancelled)'
    from clara.taxonomy_active ta;

-- =====================================================================================
-- §G′ THE RECUT. 0184 §G's body with ONE `clara._append_event` call added to the shared tail of
-- arms 5 and 6, and NOTHING ELSE MOVED. Every comment 0184 wrote at the point of use is carried
-- through, because this is now the body a reader will find.
-- =====================================================================================
create or replace function clara.cancel_accounting_work(p_work uuid, p_author uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_ctx jsonb;
  v_receipt jsonb; v_result jsonb; v_cancelled_at timestamptz;
  -- The current run is held in SCALARS rather than a record: `w.current_task_id` is nullable
  -- (nothing in the schema requires a Work to have a run), and an unassigned plpgsql record raises
  -- on its first field reference instead of reading NULL.
  v_task uuid; v_task_status text; v_task_cancelled_by uuid; v_task_cancelled_at timestamptz;
  -- #750 · the successor link, read forward-compatibly off the row record this door already holds
  -- (see this file's header): SQL NULL until #721's column exists, the column's value afterwards.
  v_superseded_by jsonb;
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
  --
  -- #750 · AND IT APPENDS NO EVENT. Nothing was cancelled: the operation won, the Work reads
  -- `completed`, and the feed already carries that operation's receipt row.
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
  -- #750 · and it appends no event — the first cancel already did.
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
  -- #750 · …nor append a SECOND event for one cancellation. The press that put the run into
  -- `cancel_requested` is the one the feed records.
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

  -- #750 · THE ONE EVENT, IN THE SHARED TAIL OF ARMS 5 AND 6. Appended AFTER the effect so a
  -- raise from either arm leaves no row claiming something that did not happen, and BEFORE the
  -- audit row so the two are written in the order a reader reconstructing the transaction expects.
  -- `w` is the row this door locked at its top, so `from_status` is the status the press found —
  -- never the one the arm above just wrote.
  v_superseded_by := to_jsonb(w) -> 'superseded_by';
  perform clara._append_event(w.firm_id, 'work.cancelled', w.client_id, p_author, null, null,
    null, null, null,
    jsonb_build_object('work', p_work, 'from_status', w.status, 'author', p_author,
      'outcome', case when coalesce(v_superseded_by, 'null'::jsonb) = 'null'::jsonb
                      then 'cancelled' else 'superseded' end,
      'superseded_by', coalesce(v_superseded_by, 'null'::jsonb)));

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
  '#630 B3/B7, #750. Cancel the remaining Work. Locks clara.accounting_work FIRST (the lane''s '
  'ordering boundary), then its current run and that run''s pending questions. A Work holding a '
  'committed receipt settles `completed` and is never reported cancelled; a live run is asked to '
  'abort and the Work reads `stopping` until clara.settle_work_run knows the answer. A cancel that '
  'actually cancels appends exactly one work.cancelled domain event.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w750_tail$
declare v_src text; v_n int; v_posture text; v_missing text;
begin
  -- 1 · still exactly ONE body, at the same signature.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='cancel_accounting_work';
  if v_n <> 1 then
    raise exception '#750 tail: clara.cancel_accounting_work now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.cancel_accounting_work(uuid,uuid,text)') is null then
    raise exception '#750 tail: clara.cancel_accounting_work(uuid,uuid,text) no longer resolves' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure;

  -- 2 · THE EVENT IS EMITTED, EXACTLY ONCE IN THE TEXT. A second call site would be a second row
  -- per cancel on some arm, which is the one thing this file must not ship.
  select count(*)::int into v_n from regexp_matches(v_src, 'clara\._append_event\(', 'g');
  if v_n <> 1 then
    raise exception '#750 tail: the committed body calls clara._append_event % times (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if position('''work.cancelled''' in v_src) = 0 then
    raise exception '#750 tail: the committed body does not name work.cancelled' using errcode='CLR10';
  end if;
  -- …and the payload carries all five keys the contract states.
  v_missing := '';
  if position('''work'', p_work' in v_src) = 0 then v_missing := v_missing || ' work'; end if;
  if position('''from_status'', w.status' in v_src) = 0 then v_missing := v_missing || ' from_status'; end if;
  if position('''author'', p_author' in v_src) = 0 then v_missing := v_missing || ' author'; end if;
  if position('''outcome''' in v_src) = 0 then v_missing := v_missing || ' outcome'; end if;
  if position('''superseded_by''' in v_src) = 0 then v_missing := v_missing || ' superseded_by'; end if;
  if position('to_jsonb(w) -> ''superseded_by''' in v_src) = 0 then v_missing := v_missing || ' forward-compatible-successor-read'; end if;
  if v_missing <> '' then
    raise exception '#750 tail: the event payload is missing key(s):%', v_missing using errcode='CLR10';
  end if;

  -- 3 · EVERY ARM 0184 SHIPPED SURVIVED, arm by arm, against the committed text. A recut of a
  -- live writer is only safe if the thing it did before is measurably still there.
  v_missing := '';
  if position('clara._work_door_ctx(' in v_src) = 0 then v_missing := v_missing || ' door-preamble'; end if;
  if position('v_ctx ? ''dedupe''' in v_src) = 0 then v_missing := v_missing || ' replay-branch'; end if;
  if position('from clara.accounting_work aw where aw.id = p_work for update' in v_src) = 0 then v_missing := v_missing || ' work-row-lock'; end if;
  if position('clara._work_committed_receipt(p_work)' in v_src) = 0 then v_missing := v_missing || ' receipt-first'; end if;
  if position('''already_completed''' in v_src) = 0 then v_missing := v_missing || ' arm1'; end if;
  if position('''already_terminal''' in v_src) = 0 then v_missing := v_missing || ' arm2-3'; end if;
  if position('''already_stopping''' in v_src) = 0 then v_missing := v_missing || ' arm4'; end if;
  if position('clara._converge_work_terminal(' in v_src) = 0 then v_missing := v_missing || ' converge'; end if;
  if position('update clara.agent_interruptions set status = ''cancelled''' in v_src) = 0 then v_missing := v_missing || ' question-cascade'; end if;
  if position('clara.settle_work_run(v_task, ''cancelled''' in v_src) = 0 then v_missing := v_missing || ' arm5-settle'; end if;
  if position('clara._work_cancelled_error()' in v_src) = 0 then v_missing := v_missing || ' cancel-error'; end if;
  if position('set status = ''cancel_requested'', updated_at = now() where id = v_task' in v_src) = 0 then v_missing := v_missing || ' arm6-request'; end if;
  if position('pg_notify(''clara_runtime_ctl'', '''')' in v_src) = 0 then v_missing := v_missing || ' notify'; end if;
  if position('''cancel_accounting_work'', p_op_key, v_result' in v_src) = 0 then v_missing := v_missing || ' finish-op'; end if;
  if v_missing <> '' then
    raise exception '#750 tail: the recut LOST arm(s):% -- only the event emission may be new', v_missing
      using errcode='CLR10';
  end if;

  -- 4 · POSTURE, read from the catalog rather than from this file's own text.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#750 tail: the door has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE to clara_runtime only; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · THE TYPE IS REGISTERED AND ROUTED, and the taxonomy-count pin 0184's tail carried is
  -- UPDATED here: the estate now has TWO `work.%` types and both are routed at the active version.
  select count(*)::int into v_n from clara.event_types where name='work.cancelled';
  if v_n <> 1 then raise exception '#750 tail: work.cancelled is not registered' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version=(select version from clara.taxonomy_active) and tt.event_type='work.cancelled';
  if v_n <> 1 then raise exception '#750 tail: work.cancelled is not routed' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.event_types where name='work.taken_over';
  if v_n <> 1 then raise exception '#750 tail: work.taken_over stopped being registered' using errcode='CLR10'; end if;
  select count(*)::int into v_n from clara.event_types where name like 'work.%';
  if v_n <> 2 then
    raise exception '#750 tail: expected exactly 2 work.%% event types (work.taken_over, work.cancelled); found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version=(select version from clara.taxonomy_active) and tt.event_type like 'work.%';
  if v_n <> 2 then
    raise exception '#750 tail: expected exactly 2 routed work.%% types at the active taxonomy version; found %', v_n
      using errcode='CLR10';
  end if;
  -- …and the FULL-COVERAGE law the catalog lives under still holds for every type, not only mine.
  select count(*)::int into v_n from clara.event_types et
   where et.name not like 'rig.%'
     and not exists (select 1 from clara.trigger_taxonomy tt
                      where tt.version=(select version from clara.taxonomy_active)
                        and tt.event_type = et.name);
  if v_n <> 0 then
    raise exception '#750 tail: % event type(s) are unrouted at the active taxonomy version (full-coverage law)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#750 tail: OK -- clara.cancel_accounting_work exists exactly once at (uuid,uuid,text), owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned and EXECUTE-reachable by clara_runtime and nobody else; it appends EXACTLY ONE work.cancelled domain event, from the shared tail of the two arms that actually cancel (no engine run -> terminal, live engine run -> cancel_requested), carrying {work, from_status, author, outcome, superseded_by} with the successor read forward-compatibly off the locked row record; the four report-only arms (already_completed, already_terminal x2, already_stopping) and the op-key replay branch append nothing; every arm 0184 §G shipped is re-measured present in the committed text; and work.cancelled is registered client-scoped and routed `ignore` at the active taxonomy version beside work.taken_over, leaving exactly two work.%% types, both routed, with the catalog''s full-coverage law intact.';
end
$w750_tail$;
