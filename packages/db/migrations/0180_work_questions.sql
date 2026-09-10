-- 0180_work_questions — #629 (refresh spec #612, journeys B3 / B4 / B6): ONE PERSISTENT QUESTION
-- PER MISSING ACCOUNTING FACT, answerable from any surface, delivered durably back to the parked
-- Work.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A `clara.agent_interruptions` row can now carry a WORK
-- IDENTITY (work_id + question_version + the Work's basis digest), the TYPED FIELDS the answer
-- must fill, and its own DELIVERY STATE; one runtime verb opens such a question, one human door
-- accepts exactly one current authorised answer for it, two read doors serve the one record every
-- surface renders, and the firm inbox (`clara.list_review_queue`) gains a `work_question` row so
-- Needs-you offers the same question the Work detail does.
--
-- =====================================================================================
-- DEPLOY ORDER. NO CONSUMER-FIRST OBLIGATION, and the ground is structural rather than a
-- judgement call:
--
--   * every new COLUMN on `clara.agent_interruptions` is nullable or defaulted, so every existing
--     writer (`clara.open_interruption`, 0006) keeps inserting exactly as it does today and every
--     existing reader keeps seeing the shape it selects. `work_id` is NULL on every chat clarify
--     ever written, and every predicate this file adds is `work_id is not null`-gated, so a chat
--     clarify is untouched by all of it.
--   * every new FUNCTION is new by name. `clara.open_work_question` has no caller until
--     `claraWork_v2` is registered; `clara.answer_work_question` and the two read doors have no
--     caller until apps/web ships them; `clara.expire_due_interruptions` is called only by the
--     runtime control cycle, and on a database without this migration that call does not exist.
--   * the ONE live body this file replaces is `clara.list_review_queue`, and it is replaced by an
--     ADDITIVE SPLICE (the 0146 / 0168 idiom) rather than a recut: the live body is NOT 0016's
--     text — 0017, 0036, 0041, 0043, 0146 and 0168 have each spliced arms into it — so a
--     `create or replace` from any migration's first text would silently DELETE row kinds and
--     predicates that shipped after it. The splice adds one CTE, one union arm, one count and one
--     count key; every pre-existing row-kind marker is re-derived at its prestate count
--     afterwards, so the change is PROVEN additive rather than asserted to be.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- WHY THE QUESTION LIVES ON `clara.agent_interruptions` AND NOT ON A NEW TABLE.
--
-- The parked run's hook token, the 14-day deadline, the lease/delivery columns, the
-- pending→answered|expired|cancelled transition allowlist, the "one pending per task"
-- linearisation, the firm-visible RLS policy and the cascades from `clara.cancel_agent_task`
-- (0006/0133) and `clara.settle_work_run` (0178) ALL already bind that table. A second table
-- would have to re-implement every one of them, and the first thing that would go wrong is the
-- one this ticket exists to prevent: two records of "the question this Work is waiting on", each
-- believing itself authoritative. The Work identity is therefore added to the row the runtime
-- already parks on.
--
-- WHAT A `question_version` IS. 1 + the number of interruptions this Work has already opened. A
-- re-asked question is a NEW ROW with the NEXT version; the old row stays as history with its own
-- terminal status. Nothing ever mutates a version, so `(question_id, question_version)` is a
-- stable draft key a browser can hold across a reload, and `stale_question` is a comparison
-- rather than a guess.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES.
--
-- clara.open_work_question                                   (runtime lane)
--   CLR10 invalid_hook_token       blank/whitespace token
--   CLR10 invalid_fields           + field + constraint (see _assert_work_question_fields)
--   CLR11 task_not_found           no such task
--   CLR10 wrong_task_kind          + kind; the task is not an accounting_work run
--   CLR10 work_unbound             an accounting_work task with no Work row
--   CLR13 hook_token_bound         the token is already bound to a DIFFERENT task
--   CLR13 question_already_pending another pending question already blocks this task
--   CLR13 task_not_running         the task is not `running`, so it cannot park
--
-- clara.answer_work_question                                 (human lane — THE FIRST-ANSWER GATE)
--   CLR04 (untyped, _human_ctx's own)  no actor / no active membership / below bookkeeper
--   CLR10 invalid_op_key           blank/whitespace op key (raised BEFORE any reservation)
--   CLR10 invalid_question_version a null or non-positive version
--   CLR10 op_key_conflict          the same key with a DIFFERENT payload (see the note at §E.2)
--   CLR13 operation_in_flight      the key is reserved by an uncommitted sibling
--   CLR11 question_not_found       unknown question, another firm's, or not a WORK question
--   CLR04 client_inactive          the Work's client is no longer active in the caller's firm
--   CLR13 already_answered         + current{status,question_version,answered_by,answered_at}
--   CLR13 expired / cancelled      + the same `current` object
--   CLR13 stale_question           + current{...}; the caller answered a different version
--   CLR13 basis_changed            the Work's basis digest is no longer the one asked about
--   CLR13 state_changed            the Work is no longer parked on THIS question's task
--   CLR10 invalid_answer           + field + constraint (see _assert_work_answer)
--
-- clara.get_work_question / clara.get_work_pending_question  (human lane, read)
--   CLR04 (untyped, _human_ctx's own). Anything else answers NULL — never an existence oracle.
--
-- clara.expire_due_interruptions                             (runtime lane)
--   (raises nothing; returns the ids it expired)
--
-- =====================================================================================
-- ONE HOUSE IDIOM DELIBERATELY REUSED FROM 0178. Every key gate reads `x is null or x ~ '^\s*$'`
-- rather than `nullif(btrim(x),'') is null`: PostgreSQL's one-argument btrim strips SPACES ONLY,
-- so a tab-or-newline key satisfies the older idiom. C82.1 asks for empty AND whitespace keys to
-- be refused before any reservation, and this is the predicate that actually does that.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w629_pre$
declare n text; v_def text;
begin
  -- 0.1 · the prerequisites this file calls, in exact regprocedure form.
  foreach n in array array[
    'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
    'clara._hash(jsonb)', 'clara._human_ctx(integer)', 'clara.role_rank(text)',
    'clara.jwt_firm()', 'clara.jwt_sub()', 'clara.agent_user_id()',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara.open_interruption(uuid,text,jsonb,uuid)',
    'clara.answer_interruption(uuid,jsonb,text)',
    'clara.settle_work_run(uuid,text,text,jsonb,jsonb)',
    'clara.list_review_queue(jsonb,jsonb,integer)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#629 prestate: prerequisite absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the two relations this file joins the question to must exist (0006 + 0178).
  if to_regclass('clara.agent_interruptions') is null then
    raise exception '#629 prestate: clara.agent_interruptions is absent' using errcode='CLR10';
  end if;
  if to_regclass('clara.accounting_work') is null then
    raise exception '#629 prestate: clara.accounting_work is absent (migration 0178 has not been applied)'
      using errcode='CLR10';
  end if;

  -- 0.3 · PARTIAL BIRTH — nothing this file creates may already exist.
  if exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='agent_interruptions' and column_name='work_id') then
    raise exception '#629 partial birth: clara.agent_interruptions.work_id already exists' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
      and p.proname in ('open_work_question','answer_work_question','get_work_question',
        'get_work_pending_question','expire_due_interruptions',
        '_assert_work_question_fields','_assert_work_answer','_work_question_record',
        '_tf_work_question_immutable')) then
    raise exception '#629 partial birth: one or more new function names already resolve' using errcode='CLR10';
  end if;

  -- 0.4 · the transition allowlist this file depends on is the one 0006 wrote. `answer_work_
  -- question` moves a row pending→answered and `expire_due_interruptions` moves it
  -- pending→expired; both are legal ONLY because `clara._tf_interruption_update` says so, and a
  -- drifted guard would turn either into a CLR08 at the first live call.
  select p.prosrc into v_def from pg_proc p
    where p.oid='clara._tf_interruption_update()'::regprocedure;
  if v_def is null or position('pending' in v_def) = 0 or position('answered' in v_def) = 0
     or position('expired' in v_def) = 0 then
    raise exception '#629 prestate: clara._tf_interruption_update no longer carries the pending->answered|expired allowlist'
      using errcode='CLR10';
  end if;

  raise notice '#629 prestate: clean — agent_interruptions carries no work identity, accounting_work exists, and the interruption transition allowlist is intact.';
end
$w629_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE WORK IDENTITY, THE TYPED FIELDS AND THE DELIVERY STATE.
--
-- ELEVEN COLUMNS, EVERY ONE NULLABLE OR DEFAULTED. A chat clarify written by
-- `clara.open_interruption` gets `work_id NULL`, `fields '[]'`, `question_version 1` and
-- `delivery_state 'pending'`, and every predicate below is `work_id is not null`-gated, so the
-- chat lane's behaviour is byte-identical after this migration.
--
-- `delivery_state` IS NOT A SECOND STATUS. `status` is the QUESTION's lifecycle (is it still
-- answerable); `delivery_state` is the RUNTIME's record of whether the terminal answer has
-- actually reached the parked run. They move independently and the pair is what retires
-- "HookNotFound = delivered by assumption": `hook_missing` is a state a row can REST in, and the
-- Work reconciler reads it to settle such a Work `expired` (recoverable) rather than leaving it
-- parked on a hook that can never fire.
-- =====================================================================================
alter table clara.agent_interruptions
  add column work_id          uuid references clara.accounting_work(id),
  add column client_id        uuid,
  add column question_version int not null default 1 check (question_version >= 1),
  add column basis_digest     text,
  add column fields           jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  add column reason           text,
  add column source_ref       jsonb check (source_ref is null or jsonb_typeof(source_ref) = 'object'),
  add column answer_key       text,
  add column answered_role    text,
  add column delivery_state   text not null default 'pending'
                              check (delivery_state in ('pending','leased','delivered','hook_missing')),
  add column delivery_attempts int not null default 0 check (delivery_attempts >= 0);

comment on column clara.agent_interruptions.work_id is
  '#629: the clara.accounting_work row this question belongs to, or NULL for a chat clarify. Every '
  'work-question predicate in the estate is gated on `work_id is not null`.';
comment on column clara.agent_interruptions.question_version is
  '#629: 1 + the number of interruptions this Work had already opened when this row was written. '
  'Immutable. A re-asked question is a NEW row with the NEXT version; the old row stays as history.';
comment on column clara.agent_interruptions.delivery_state is
  '#629: the RUNTIME''s record of whether the terminal answer reached the parked run. '
  'pending -> leased -> delivered, or leased -> hook_missing when the engine hook is gone and the '
  'run state proves the resume never landed. NOT a second `status`.';

-- ONE PENDING-OR-HISTORICAL ROW PER (Work, version). The partial unique index is what makes
-- `question_version` an identity rather than a label: two concurrent opens on the same Work cannot
-- both mint version N.
create unique index uq_agent_interruptions_work_version
  on clara.agent_interruptions (work_id, question_version) where (work_id is not null);
-- The Needs-you row source and `get_work_pending_question`'s own lookup.
create index ix_agent_interruptions_work_pending
  on clara.agent_interruptions (work_id) where (work_id is not null and status = 'pending');
-- The delivery scan's predicate: terminal-but-undelivered, excluding rows already reconciled to
-- `hook_missing`.
create index ix_agent_interruptions_delivery
  on clara.agent_interruptions (created_at)
  where (delivered_at is null and delivery_state <> 'hook_missing');

-- -------------------------------------------------------------------------------------
-- THE SECOND IMMUTABILITY BELT. `clara._tf_interruption_update` (0006) freezes the row's original
-- identity and content — id, task, firm, token, kind, question, created_at, expires_at, asked_of —
-- and deliberately leaves the lease/delivery columns free because they are runtime bookkeeping.
-- The columns THIS file adds split the same way, so they need their own guard rather than a
-- widening of a body 0006 owns:
--
--   FROZEN (the question's identity and content): work_id, client_id, question_version,
--     basis_digest, fields, reason, source_ref. A question whose FIELDS could be rewritten after
--     a human started answering it is a question nobody can be held to.
--   FREE (runtime/answer bookkeeping): answer_key, answered_role, delivery_state,
--     delivery_attempts — with two ratchets, because "free" is not the same as "arbitrary":
--     `delivered` is TERMINAL for delivery_state (nothing un-delivers an answer), and
--     delivery_attempts only ever increases.
--
-- A SEPARATE TRIGGER, NOT A REPLACEMENT. 0006's body is unedited; both fire BEFORE UPDATE and
-- PostgreSQL orders them by NAME, so `t_interruption_update` runs first and this one second.
-- Neither depends on the other's order.
-- -------------------------------------------------------------------------------------
create function clara._tf_work_question_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_frozen text[] := array['work_id','client_id','question_version','basis_digest','fields',
                           'reason','source_ref'];
  c text;
begin
  -- SCOPED TO WORK QUESTIONS, and it is the same scoping every other predicate in this file
  -- carries. A CHAT clarify's lease/delivery columns were left free by 0006 on purpose (they are
  -- runtime bookkeeping), and `control-lease.test.mjs` drives a crash-and-retry by resetting
  -- `delivered_at` on exactly such a row. Making the ratchet bind that lane would have changed the
  -- chat lane's behaviour as a side effect of a Work ticket — the thing this migration's header
  -- promises it does not do.
  if new.work_id is null and old.work_id is null then return new; end if;
  foreach c in array v_frozen loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'work-question column % is immutable', c
        using errcode='CLR08',
          detail=jsonb_build_object('reason','work_question_immutable','column',c)::text;
    end if;
  end loop;
  if old.delivery_state = 'delivered' and new.delivery_state <> 'delivered' then
    raise exception 'a delivered question is never un-delivered'
      using errcode='CLR08', detail='{"reason":"work_question_immutable","column":"delivery_state"}';
  end if;
  if new.delivery_attempts < old.delivery_attempts then
    raise exception 'delivery_attempts only increases'
      using errcode='CLR08', detail='{"reason":"work_question_immutable","column":"delivery_attempts"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_work_question_immutable() from public;
create trigger t_interruption_work_question_immutable before update on clara.agent_interruptions
  for each row execute function clara._tf_work_question_immutable();

-- =====================================================================================
-- §B  THE FIELD PREDICATES. Ungranted; shared by the OPEN verb (which validates the declared
-- fields) and the ANSWER door (which validates a human's values against those same fields), so
-- the two can never disagree about what a well-formed question is.
--
-- THE FIELD PATH IS THE FIELD'S OWN `key`, NOT AN INDEX, wherever one exists. The web focuses the
-- first invalid control by key, and a key survives a reordered array where an index does not. Only
-- a field whose `key` is itself malformed is reported by 1-based ordinal (`fields[N]`), matching
-- SQL's own `with ordinality` exactly as 0178's basis assertion does.
-- =====================================================================================
create function clara._assert_work_question_fields(p_fields jsonb) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare
  f jsonb; i int; v_key text; v_kind text; v_keys text[] := '{}'; o jsonb; j int;
  v_allowed text[] := array['key','label','kind','required','options','unit'];
  k text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'a work question declares an array of fields' using errcode='CLR10',
      detail='{"reason":"invalid_fields","field":"fields","constraint":"array"}';
  end if;
  if jsonb_array_length(p_fields) < 1 or jsonb_array_length(p_fields) > 6 then
    raise exception 'a work question declares between one and six fields (got %)', jsonb_array_length(p_fields)
      using errcode='CLR10', detail='{"reason":"invalid_fields","field":"fields","constraint":"one_to_six"}';
  end if;
  i := 0;
  for f in select value from jsonb_array_elements(p_fields) loop
    i := i + 1;
    if jsonb_typeof(f) <> 'object' then
      raise exception 'field % is not an object', i using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',format('fields[%s]',i),'constraint','object')::text;
    end if;
    for k in select jsonb_object_keys(f) loop
      if not (k = any (v_allowed)) then
        raise exception 'field % carries an unknown key %', i, k using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_fields','field',format('fields[%s]',i),
            'constraint','unknown_key','key',k)::text;
      end if;
    end loop;
    v_key := f->>'key';
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'field % has no lawful key', i using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',format('fields[%s]',i),'constraint','key_shape')::text;
    end if;
    if v_key = any (v_keys) then
      raise exception 'field key % is declared twice', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','duplicate_key')::text;
    end if;
    v_keys := v_keys || v_key;
    -- `note` is the door's own reserved answer key (a free-text remark a human may always add), so
    -- a declared field may not claim it: two writers for one answer key is one too many.
    if v_key = 'note' then
      raise exception 'the key "note" is reserved for the answer''s own remark' using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','reserved_key')::text;
    end if;
    if f->>'label' is null or f->>'label' ~ '^\s*$' then
      raise exception 'field % has no label', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','label')::text;
    end if;
    if length(f->>'label') > 200 then
      raise exception 'field %''s label is too long', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','label_max_length')::text;
    end if;
    v_kind := f->>'kind';
    if v_kind is null or v_kind not in ('text','money','date','choice','account') then
      raise exception 'field % has an unknown kind %', v_key, coalesce(v_kind,'<null>') using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','kind')::text;
    end if;
    if f ? 'required' and jsonb_typeof(f->'required') <> 'boolean' then
      raise exception 'field %''s required flag is not a boolean', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','required_boolean')::text;
    end if;
    if f ? 'unit' and (jsonb_typeof(f->'unit') <> 'string' or f->>'unit' ~ '^\s*$') then
      raise exception 'field %''s unit is not a non-empty string', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','unit')::text;
    end if;
    if v_kind = 'choice' then
      -- `f ? 'options'` FIRST, and it is load-bearing rather than defensive: `f->'options'` is SQL
      -- NULL when the key is absent, so `jsonb_typeof(NULL) <> 'array'` evaluates to NULL, the
      -- whole OR collapses to NULL, and `if NULL then` does NOT raise. A choice field with no
      -- options would have been admitted — measured by the cell, not reasoned about.
      if not (f ? 'options') or jsonb_typeof(f->'options') <> 'array'
         or jsonb_array_length(f->'options') < 2
         or jsonb_array_length(f->'options') > 20 then
        raise exception 'choice field % needs between two and twenty options', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','options')::text;
      end if;
      j := 0;
      for o in select value from jsonb_array_elements(f->'options') loop
        j := j + 1;
        if jsonb_typeof(o) <> 'object' or o->>'value' is null or o->>'value' ~ '^\s*$'
           or o->>'label' is null or o->>'label' ~ '^\s*$' then
          raise exception 'option % of field % is not a {value,label} pair', j, v_key using errcode='CLR10',
            detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','option_shape',
              'option',j)::text;
        end if;
      end loop;
      if (select count(distinct o2->>'value') from jsonb_array_elements(f->'options') o2)
         <> jsonb_array_length(f->'options') then
        raise exception 'field % declares a duplicate option value', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','option_values_unique')::text;
      end if;
    elsif f ? 'options' then
      raise exception 'only a choice field carries options (field %)', v_key using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_fields','field',v_key,'constraint','options_not_allowed')::text;
    end if;
  end loop;
end $$;
revoke all on function clara._assert_work_question_fields(jsonb) from public;

-- -------------------------------------------------------------------------------------
-- THE ANSWER, VALIDATED AGAINST THE FIELDS THE QUESTION DECLARED.
--
-- `money` IS AN INTEGER MINOR UNIT AND NOTHING ELSE. `jsonb_typeof(v) = 'number'` alone admits
-- 1200.5, and `(v#>>'{}')::bigint` would happily round it — the exact coercion the accounting law
-- forbids. The predicate is therefore the TEXT form of the number matching `^-?\d+$`, which is
-- what 0178's `clara._journal_cents` does for the same reason, and 1.2e5 is admitted (it renders
-- as 120000) while 1200.5 is refused before any cast.
--
-- `account` IS AN ACTIVE CODE OF *THIS* CLIENT. The client comes from the QUESTION's own row, never
-- from the answer, so no answer can point at another tenant's chart.
-- -------------------------------------------------------------------------------------
create function clara._assert_work_answer(p_fields jsonb, p_answer jsonb, p_client uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  f jsonb; v_key text; v_kind text; v_required boolean; v jsonb; v_txt text; k text;
  v_declared text[] := '{}';
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' then
    raise exception 'an answer is a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_answer","field":"answer","constraint":"object"}';
  end if;
  for f in select value from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    v_key := f->>'key';
    v_declared := v_declared || v_key;
    v_kind := f->>'kind';
    v_required := coalesce((f->'required')::text::boolean, true);
    v := p_answer -> v_key;
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*$') then
      if v_required then
        raise exception 'field % is required', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','required')::text;
      end if;
      continue;   -- an optional field left blank is simply absent from the accepted answer
    end if;
    if v_kind = 'money' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^-?\d+$' then
        raise exception 'field % must be an integer number of cents', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','integer_cents')::text;
      end if;
    elsif v_kind = 'date' then
      v_txt := v #>> '{}';
      if jsonb_typeof(v) <> 'string' or v_txt !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'field % must be an ISO date', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','iso_date')::text;
      end if;
      begin
        perform v_txt::date;
      exception when others then
        raise exception 'field % is not a real calendar date', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','iso_date')::text;
      end;
    elsif v_kind = 'choice' then
      if jsonb_typeof(v) <> 'string'
         or not exists (select 1 from jsonb_array_elements(f->'options') o
                         where o->>'value' = (v #>> '{}')) then
        raise exception 'field % must be one of its declared options', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','option')::text;
      end if;
    elsif v_kind = 'account' then
      if jsonb_typeof(v) <> 'string'
         or not exists (select 1 from clara.coa_accounts a
                         where a.client_id = p_client and a.account_code = (v #>> '{}')
                           and a.is_active) then
        raise exception 'field % must be an active account code of this client', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','active_account')::text;
      end if;
    else   -- text
      if jsonb_typeof(v) <> 'string' then
        raise exception 'field % must be text', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','text')::text;
      end if;
      if length(v #>> '{}') > 4000 then
        raise exception 'field % is longer than 4000 characters', v_key using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_answer','field',v_key,'constraint','max_length')::text;
      end if;
    end if;
  end loop;
  -- No key the question did not ask for, except the reserved free-text remark.
  for k in select jsonb_object_keys(p_answer) loop
    if k = 'note' then
      if jsonb_typeof(p_answer->'note') <> 'string' or length(p_answer->>'note') > 4000 then
        raise exception 'the answer''s note must be text of at most 4000 characters' using errcode='CLR10',
          detail='{"reason":"invalid_answer","field":"note","constraint":"max_length"}';
      end if;
      continue;
    end if;
    if not (k = any (v_declared)) then
      raise exception 'the answer carries a key % this question did not ask for', k using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_answer','field',k,'constraint','unknown_key')::text;
    end if;
  end loop;
end $$;
revoke all on function clara._assert_work_answer(jsonb,jsonb,uuid) from public;

-- =====================================================================================
-- §C  THE ONE RECORD EVERY SURFACE RENDERS. Spelled ONCE so the Work detail, the Needs-you
-- affordance and the Clara rail card cannot each derive a slightly different question.
--
-- UNGRANTED and firm-BLIND: the two read doors below do the firm scoping and then call this for
-- the projection, exactly as `clara._work_committed_receipt` (0178) is shaped.
-- =====================================================================================
create function clara._work_question_record(p_question uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'question_id', i.id,
    'work_id', i.work_id,
    'client_id', i.client_id,
    'task_id', i.task_id,
    'firm_id', i.firm_id,
    'question_version', i.question_version,
    'status', i.status,
    'question', nullif(btrim(coalesce(i.question->>'question', i.question->>'text', '')), ''),
    'context', nullif(btrim(coalesce(i.question->>'context','')), ''),
    'reason', i.reason,
    'fields', i.fields,
    'source_ref', i.source_ref,
    'basis_digest', i.basis_digest,
    'expires_at', i.expires_at,
    'created_at', i.created_at,
    'answer', i.answer,
    'answered_by', i.answered_by,
    'answered_at', i.answered_at,
    'answered_role', i.answered_role,
    'delivery_state', i.delivery_state,
    'delivery_attempts', i.delivery_attempts,
    'work_status', w.status,
    'work_basis_digest', w.basis_digest)
  from clara.agent_interruptions i
  join clara.accounting_work w on w.id = i.work_id
  where i.id = p_question and i.work_id is not null;
$$;
revoke all on function clara._work_question_record(uuid) from public;

-- =====================================================================================
-- §D  THE RUNTIME LANE — clara.open_work_question.
--
-- SAME LINEARISATION AS `clara.open_interruption` (0006:1078), because it is the same act on the
-- same table and a second linearisation is how two lanes come to disagree about what "parked"
-- means. The order is 0006's, restated:
--   (1) the globally-unique hook_token already resolves -> IDEMPOTENT replay (a memoized-token
--       crash-replay lands here and must return the ORIGINAL record, not open a second question);
--   (2) ANY OTHER pending question on the task -> CLR13, no insert, no transition (the
--       running-with-a-pending-question double-open the transition gate alone cannot catch);
--   (3) else conditionally transition running->awaiting_input AND insert, in ONE txn.
--
-- WHAT IS ADDED ON TOP, AND WHY EACH IS HERE RATHER THAN IN THE WORKFLOW:
--   * the task must be `kind='accounting_work'` WITH a Work. A question that names no Work has no
--     basis to be stale against and no client to scope an account field by, so the whole
--     first-answer gate below would have nothing to check.
--   * work_id / client_id / basis_digest are STAMPED FROM THE WORK ROW, never from an argument.
--     That is what makes `basis_changed` a wall rather than a formality at answer time.
--   * question_version is COUNTED, in the same statement, under the row lock the insert takes on
--     the partial unique index. Two racing opens cannot both mint version N.
--   * the fields are validated HERE, before a human ever sees them: a question declaring a
--     malformed field would be unanswerable, and the honest place to refuse it is the lane that
--     wrote it.
-- =====================================================================================
create function clara.open_work_question(p_task uuid, p_hook_token text, p_question jsonb,
    p_fields jsonb, p_reason text default null, p_source_ref jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_id uuid; v_task uuid; v_upd int; t record; w record; v_version int; v_expires timestamptz;
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

  -- (2) Linearisation: a DIFFERENT pending question already blocks this task.
  if exists (select 1 from clara.agent_interruptions where task_id = p_task and status = 'pending') then
    raise exception 'a question is already pending for task %', p_task using errcode='CLR13',
      detail='{"reason":"question_already_pending"}';
  end if;

  -- (3) Conditional transition; zero rows ⇒ not running ⇒ CLR13 and NO insert.
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

  select coalesce(max(question_version), 0) + 1 into v_version
    from clara.agent_interruptions where work_id = w.id;

  insert into clara.agent_interruptions
      (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
       basis_digest, fields, reason, source_ref)
    values (p_task, p_hook_token, coalesce(p_question, '{}'::jsonb), now() + interval '14 days',
       w.id, w.client_id, v_version, w.basis_digest, p_fields,
       nullif(btrim(coalesce(p_reason,'')), ''), p_source_ref)
    returning id, expires_at into v_id, v_expires;

  return jsonb_build_object('question_id', v_id, 'work_id', w.id,
    'question_version', v_version, 'expires_at', v_expires, 'replayed', false);
end $$;
revoke all on function clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb) from public;
grant execute on function clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb) to clara_runtime;

-- =====================================================================================
-- §E  THE HUMAN LANE — clara.answer_work_question, THE FIRST-ANSWER GATE.
--
-- THE ORDER IS THE ESTATE'S GUARD-FIRST ORDER (0004's header), and every step of it is
-- load-bearing here:
--
--   1. authority          `_human_ctx(role_rank('bookkeeper'))` — the same floor
--                         `clara.answer_interruption` uses.
--   2. op_key + reserve   BEFORE any effect. A retried submit after a lost response REPLAYS the
--                         original receipt instead of answering twice; the SAME key with a
--                         DIFFERENT payload is `op_key_conflict`, which is the estate's own
--                         `_reserve_op` refusal re-raised with a typed detail (0004:46-60 raises
--                         CLR10 'op_key reused with different args' with NO detail, and every
--                         consumer of this door keys on the pair, so the bare raise is caught and
--                         re-raised rather than left untyped).
--   3. LOCK THE ROW       `select ... for update`, and only THEN compare the deadline with
--                         clock_timestamp() (S4-D5: now() freezes at txn start, so an answer that
--                         waited across the deadline must lose).
--   4. converge           status / version / basis / Work state, each with the AUTHORITATIVE
--                         current record in `detail.current`, because the loser of a race needs to
--                         render what actually happened, not merely be told it lost.
--   5. validate           the values against the fields the question declared.
--   6. accept             one write, one audit row, one NOTIFY, one receipt.
--
-- TWO RACING SESSIONS SERIALISE ON STEP 3. The loser reaches step 4 with the winner's answer
-- already on the row and gets `already_answered` carrying the winner's identity and time — the
-- exact material the "answered elsewhere" surface renders.
-- =====================================================================================
create function clara.answer_work_question(p_question uuid, p_question_version int,
    p_answer jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; i record; w record; v_client_status text; v_role text;
  v_current jsonb; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_question_version is null or p_question_version < 1 then
    raise exception 'a question version is required' using errcode='CLR10',
      detail='{"reason":"invalid_question_version"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'answer_work_question', p_op_key,
      clara._hash(jsonb_build_object('q', p_question, 'v', p_question_version, 'a', p_answer)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args". Re-raised WITH a detail so
    -- this door's contract is one shape: every refusal it emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different answer' using errcode='CLR10',
      detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this answer is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                              -- the ORIGINAL receipt, byte-identical
  end if;

  select * into i from clara.agent_interruptions where id = p_question for update;
  -- NO ORACLE: an unknown id, another firm's row and a CHAT clarify all answer the same way. A
  -- caller learns nothing about what exists outside its own firm.
  if not found or i.firm_id <> c.firm or i.work_id is null then
    raise exception 'question not found' using errcode='CLR11', detail='{"reason":"question_not_found"}';
  end if;
  select aw.id, aw.status, aw.basis_digest, aw.current_task_id, aw.client_id into w
    from clara.accounting_work aw where aw.id = i.work_id;

  select cl.status into v_client_status from clara.clients cl
   where cl.id = i.client_id and cl.firm_id = c.firm;
  if v_client_status is distinct from 'active' then
    raise exception 'this client is not active' using errcode='CLR04',
      detail='{"reason":"client_inactive"}';
  end if;

  v_current := jsonb_build_object('status', i.status, 'question_version', i.question_version,
    'answered_by', i.answered_by, 'answered_at', i.answered_at,
    'work_id', i.work_id, 'work_status', w.status);

  if i.status <> 'pending' then
    raise exception 'this question is no longer open (%)', i.status using errcode='CLR13',
      detail=jsonb_build_object(
        'reason', case i.status when 'answered' then 'already_answered' else i.status end,
        'current', v_current)::text;
  end if;
  if i.question_version <> p_question_version then
    raise exception 'this answer is for question version %, the current version is %',
      p_question_version, i.question_version
      using errcode='CLR13', detail=jsonb_build_object('reason','stale_question','current',v_current)::text;
  end if;
  -- THE DEADLINE, COMPARED AFTER THE LOCK (S4-D5).
  if i.expires_at < clock_timestamp() then
    raise exception 'this question has expired' using errcode='CLR13',
      detail=jsonb_build_object('reason','expired','current',v_current)::text;
  end if;
  -- THE WORK MUST STILL BE PARKED ON *THIS* QUESTION'S RUN.
  if w.status <> 'awaiting_input' or w.current_task_id is distinct from i.task_id then
    raise exception 'this Work is no longer waiting on this question' using errcode='CLR13',
      detail=jsonb_build_object('reason','state_changed','current',v_current)::text;
  end if;
  -- AND THE BASIS MUST STILL BE THE ONE THE QUESTION WAS ASKED ABOUT.
  if w.basis_digest is distinct from i.basis_digest then
    raise exception 'the basis this question was asked about has changed' using errcode='CLR13',
      detail=jsonb_build_object('reason','basis_changed','current',v_current)::text;
  end if;

  perform clara._assert_work_answer(i.fields, p_answer, i.client_id);

  select m.role into v_role from clara.firm_memberships m
   where m.firm_id = c.firm and m.user_id = c.actor and m.status = 'active';

  update clara.agent_interruptions
     set status = 'answered', answer = p_answer, answered_by = c.actor, answered_at = now(),
         answer_key = p_op_key, answered_role = v_role
   where id = p_question and status = 'pending';

  perform clara._audit(c.firm, c.actor, null, null, 'answer_work_question', null,
    jsonb_build_object('question', p_question, 'work', i.work_id,
      'question_version', i.question_version, 'op_key', p_op_key));
  perform pg_notify('clara_runtime_ctl', '');

  v_result := jsonb_build_object('question_id', p_question, 'work_id', i.work_id,
    'question_version', i.question_version, 'status', 'answered',
    'answered_by', c.actor, 'answered_role', v_role,
    'answered_at', (select answered_at from clara.agent_interruptions where id = p_question));
  return clara._finish_op(c.firm, 'answer_work_question', p_op_key, v_result);
end $$;
revoke all on function clara.answer_work_question(uuid,int,jsonb,text) from public;
grant execute on function clara.answer_work_question(uuid,int,jsonb,text) to clara_authenticated;

-- =====================================================================================
-- §F  THE READ DOORS. Bookkeeper+, firm-scoped, and NEVER an existence oracle: an unknown id,
-- another firm's question and a chat clarify all answer NULL.
--
-- WHY A DOOR AND NOT A TABLE READ. `clara.agent_interruptions` carries a firm-pinned SELECT policy
-- for `clara_authenticated`, so a plain PostgREST read would work — and would hand every surface a
-- different subset of columns to re-derive the question from, with the JOIN to
-- `clara.accounting_work` (for `work_status`) not reachable at all under the human role, because
-- 0178 grants no client-scoping predicate that PostgREST could express here in one request. One
-- door returning one record is what makes "the same record on B3, B4 and B6" mechanical.
-- =====================================================================================
create function clara.get_work_question(p_question uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select i.firm_id into v_firm from clara.agent_interruptions i
   where i.id = p_question and i.work_id is not null;
  if v_firm is null or v_firm <> c.firm then return null; end if;
  return clara._work_question_record(p_question);
end $$;
revoke all on function clara.get_work_question(uuid) from public;
grant execute on function clara.get_work_question(uuid) to clara_authenticated;

create function clara.get_work_pending_question(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select i.id into v_id from clara.agent_interruptions i
    join clara.accounting_work w on w.id = i.work_id
   where i.work_id = p_work and i.status = 'pending' and w.firm_id = c.firm;
  if v_id is null then return null; end if;
  return clara._work_question_record(v_id);
end $$;
revoke all on function clara.get_work_pending_question(uuid) from public;
grant execute on function clara.get_work_pending_question(uuid) to clara_authenticated;

-- =====================================================================================
-- §G  EXPIRY. THE 14-DAY DEADLINE HAD NO ENFORCER.
--
-- MEASURED FINDING, not a design preference: `clara.agent_interruptions.expires_at` has carried a
-- 14-day deadline since 0006, `clara.answer_interruption` refuses an answer that arrives after it,
-- and NOTHING in packages/db or packages/runtime ever moved a past-due row to `expired`. A Work
-- parked on a question nobody answers therefore stayed `awaiting_input` for ever: the question was
-- unanswerable, the run was parked on a live hook, and no surface could say so. That is exactly
-- the state #629's "expiry leaves the business question recoverable" line is about.
--
-- SCOPED TO WORK QUESTIONS (`work_id is not null`) AND NOTHING ELSE. Expiring a past-due CHAT
-- clarify would resume a chatTurn run with `{kind:'expired'}` — plausibly the right behaviour, and
-- categorically not this ticket's subject. The chat lane's identical gap is reported as a finding
-- rather than fixed here by side effect.
--
-- THE CUTOFF IS `clock_timestamp()` AND TAKES NO PARAMETER. A caller-supplied cutoff would let the
-- runtime lane expire questions that are not due, which is a hole no test convenience is worth.
-- =====================================================================================
create function clara.expire_due_interruptions(p_limit int default 50, p_firm uuid default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; r record;
begin
  with due as (
    select id from clara.agent_interruptions
     where status = 'pending' and work_id is not null
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
-- §H  THE FIRM INBOX GAINS A `work_question` ROW — AN ADDITIVE SPLICE, NEVER A RECUT.
--
-- `clara.list_review_queue` was born at 0011, REPLACED WHOLE at 0016, and then SPLICED by 0017
-- (lint_finding), 0036 (autodraft), 0041 (fixed_asset_incomplete), 0043
-- (staff_advance_incomplete), 0146 (seeding_proposal) and 0168 (the codeability conjunct on
-- filing_rows). Its LIVE body is therefore no migration's first text, and a `create or replace`
-- from any of them would silently delete row kinds and predicates that shipped afterwards. This
-- block reads the INSTALLED definition, verifies every pre-existing marker at its exact count IN
-- CODE (and cross-checks the raw count so a marker hiding inside a comment cannot stand in for a
-- real one — 0146's HIGH-1 guard), splices, and then re-derives every one of those markers.
--
-- THE ROW SHAPE IS UNCHANGED, AND THAT IS DELIBERATE. `work_question` rows reuse the existing
-- 30-key row json: `id`/`question_id` carry the question, `task_id` the parked run, `client_id`
-- the client, `question_text` the question itself, `created_at`/`aged_since` the wait. Everything
-- else a surface needs — the version, the typed fields, the reason, the source ref — comes from
-- `clara.get_work_question`, which is the ONE record every surface renders. Adding keys here would
-- have widened a shape ten other row kinds carry, for one kind's benefit.
--
-- `counts` GAINS EXACTLY ONE INTEGER KEY, `work_questions`. `lane='needs_you'` on the new rows
-- means the existing `needs_you` count already includes them, exactly as it already includes
-- `open_question` rows; the new key answers "how many of those are Work questions" without
-- changing what any existing key means.
-- =====================================================================================
do $w629_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '#629 lrq prestate: clara.list_review_queue is GONE' using errcode='CLR10';
  end if;
  -- Strip block comments THEN line comments (the 0141/M9 order — a block comment must not hide a
  -- live line-comment marker from the second pass). Every roster/anchor check reads v_code.
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- (a) IDEMPOTENCY, measured IN CODE so a comment cannot short-circuit a real apply.
  if position('work_question' in v_code) <> 0 then
    raise exception '#629 lrq prestate: the queue already projects work_question — this splice has already been applied'
      using errcode='CLR10';
  end if;

  -- (b) THE WITNESS ROSTER: the live body is the post-0168 body this splice was derived against.
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1),
      ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'seeding_proposal'::text row_kind$$, 1),
      ('null::int open_proposal_count', 8),
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#629 lrq prestate: list_review_queue carries the marker "%" % time(s) IN CODE, expected % — the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
    v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_raw_n <> v_n then
      raise exception '#629 lrq prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % IN CODE — % occurrence(s) hide inside a comment', r.marker, v_raw_n, v_n, (v_raw_n - v_n)
        using errcode='CLR10';
    end if;
  end loop;

  -- =====================================================================
  -- SPLICE (1): the new work_question_rows CTE + the all_rows union arm. Anchored on the WHOLE
  -- all_rows block (0043 S3.8 / 0146 splice (b)) so both land in ONE replace().
  -- =====================================================================
  v_anchor :=
    '  ), all_rows as (' || chr(10) ||
    '    select * from draft_rows union all select * from filing_rows' || chr(10) ||
    '    union all select * from question_rows union all select * from task_rows' || chr(10) ||
    '    union all select * from compliance_rows union all select * from lint_rows' || chr(10) ||
    '    union all select * from fa_rows union all select * from adv_rows' || chr(10) ||
    '    union all select * from seeding_rows' || chr(10) ||
    '  ), keyed as (';
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception '#629 lrq splice (1) prestate: the all_rows union block appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode='CLR10';
  end if;
  v_repl := $wq$  ), work_question_rows as (
    -- #629: the ONE persistent question a parked accounting Work is waiting on. Section
    -- `needs_you` with lane `needs_you`, exactly like `open_question` rows: a person must act
    -- before the Work can move, which is what that lane means. The client join is the
    -- active-client guard eight of the other nine kinds already carry (0017 R1-F5).
    select 1 section_rank,'work_question'::text row_kind,'needs_you'::text section,
      wqw.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      wqi.id question_id,wqi.task_id,null::uuid document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,wqi.created_at aged_since,
      null::bigint amount_cents,null::text period,
      nullif(btrim(coalesce(wqi.question->>'question',wqi.question->>'text','')),'') question_text,
      wqi.created_at created_at,wqi.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.agent_interruptions wqi
    join clara.accounting_work wqw on wqw.id=wqi.work_id
    join clara.clients wqc on wqc.id=wqw.client_id and wqc.status='active'
    where wqi.firm_id=c.firm and wqi.status='pending' and wqi.work_id is not null
      and (v_client is null or wqw.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
    union all select * from seeding_rows
    union all select * from work_question_rows
  ), keyed as ($wq$;
  v_next := replace(v_def, v_anchor, v_repl);
  if position('union all select * from work_question_rows' in v_next) = 0 then
    raise exception '#629 lrq splice (1): the all_rows anchor did not rewrite' using errcode='CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (2): the counts CTE gains ONE integer aggregate.
  -- =====================================================================
  v_anchor := $$count(*) filter(where row_kind='lint_finding')::int lint_findings from all_rows$$;
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception '#629 lrq splice (2) prestate: the counts anchor appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode='CLR10';
  end if;
  v_repl := $$count(*) filter(where row_kind='lint_finding')::int lint_findings, count(*) filter(where row_kind='work_question')::int work_questions from all_rows$$;
  v_next := replace(v_next, v_anchor, v_repl);
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (3): the counts envelope gains the matching key.
  -- =====================================================================
  v_anchor := $$'compliance_watches',counts.compliance_watches,'lint_findings',counts.lint_findings)$$;
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception '#629 lrq splice (3) prestate: the counts envelope anchor appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode='CLR10';
  end if;
  v_repl := $$'compliance_watches',counts.compliance_watches,'lint_findings',counts.lint_findings,'work_questions',counts.work_questions)$$;
  v_next := replace(v_next, v_anchor, v_repl);

  execute v_next;

  -- =====================================================================
  -- POSTCHECK. Owner and ACL byte-identical; every pre-existing marker re-derived at its
  -- prestate count; the three new markers present exactly once.
  -- =====================================================================
  select p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_post_owner, v_post_acl, v_post_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
    raise exception '#629 lrq postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
      v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1),
      ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'seeding_proposal'::text row_kind$$, 1),
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1),
      ($$'work_question'::text row_kind$$, 1),
      ($$count(*) filter(where row_kind='work_question')::int work_questions$$, 1),
      ($$'work_questions',counts.work_questions$$, 1)) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#629 lrq postcheck: marker "%" appears % time(s), expected % — the splice was not additive', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- `null::int open_proposal_count` gains ONE occurrence (the new CTE's own trailing column).
  v_n := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
         / length('null::int open_proposal_count');
  if v_n <> 9 then
    raise exception '#629 lrq postcheck: the shared column vector appears % time(s), expected 9', v_n
      using errcode='CLR10';
  end if;

  raise notice '#629: clara.list_review_queue spliced — one work_question CTE (needs_you/needs_you, active-client-guarded, one row per PENDING work question), one union arm, one counts aggregate and one counts key; the 30-key row shape is BYTE-UNTOUCHED and every pre-existing row kind survives at its prestate marker count; owner (%) and ACL byte-identical. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
end
$w629_lrq$;

-- =====================================================================================
-- §I  TAIL CENSUS. Re-read the committed catalog and say what it found.
-- =====================================================================================
do $w629_tail$
declare v_n int; n text; v_grantee text;
begin
  -- Every new function exists at its exact signature.
  foreach n in array array[
    'clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)',
    'clara.answer_work_question(uuid,integer,jsonb,text)',
    'clara.get_work_question(uuid)',
    'clara.get_work_pending_question(uuid)',
    'clara.expire_due_interruptions(integer,uuid)',
    'clara._assert_work_question_fields(jsonb)',
    'clara._assert_work_answer(jsonb,jsonb,uuid)',
    'clara._work_question_record(uuid)',
    'clara._tf_work_question_immutable()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#629 tail: % did not survive the migration', n using errcode='CLR10';
    end if;
  end loop;

  -- ZERO PUBLIC EXECUTE on anything this file created.
  select count(*) into v_n from information_schema.role_routine_grants g
   where g.routine_schema = 'clara' and g.grantee = 'PUBLIC'
     and g.routine_name in ('open_work_question','answer_work_question','get_work_question',
       'get_work_pending_question','expire_due_interruptions','_assert_work_question_fields',
       '_assert_work_answer','_work_question_record','_tf_work_question_immutable');
  if v_n <> 0 then
    raise exception '#629 tail: PUBLIC holds EXECUTE on % of this migration''s functions', v_n
      using errcode='CLR10';
  end if;

  -- The ungranted helpers are granted to NOBODY.
  select count(*) into v_n from information_schema.role_routine_grants g
   where g.routine_schema = 'clara'
     and g.routine_name in ('_assert_work_question_fields','_assert_work_answer',
       '_work_question_record','_tf_work_question_immutable')
     and g.grantee not in ('clara_fn_owner');
  if v_n <> 0 then
    raise exception '#629 tail: an ungranted helper carries % non-owner grant(s)', v_n using errcode='CLR10';
  end if;

  -- The two lanes hold exactly the doors they are supposed to hold.
  for n, v_grantee in select * from (values
      ('open_work_question','clara_runtime'),
      ('expire_due_interruptions','clara_runtime'),
      ('answer_work_question','clara_authenticated'),
      ('get_work_question','clara_authenticated'),
      ('get_work_pending_question','clara_authenticated')) as t(fn, grantee) loop
    if not exists (select 1 from information_schema.role_routine_grants g
        where g.routine_schema='clara' and g.routine_name = n and g.grantee = v_grantee) then
      raise exception '#629 tail: % is not granted to %', n, v_grantee using errcode='CLR10';
    end if;
  end loop;
  -- …and NOTHING gained a wake or agent grant.
  select count(*) into v_n from information_schema.role_routine_grants g
   where g.routine_schema = 'clara' and g.grantee like 'clara_wake%'
     and g.routine_name in ('open_work_question','answer_work_question','get_work_question',
       'get_work_pending_question','expire_due_interruptions');
  if v_n <> 0 then
    raise exception '#629 tail: a wake role holds EXECUTE on one of this migration''s doors' using errcode='CLR10';
  end if;

  -- The eleven columns are on the table, and the partial unique index behind `question_version`
  -- is there (an identity without its index is a label).
  select count(*) into v_n from information_schema.columns
   where table_schema='clara' and table_name='agent_interruptions'
     and column_name in ('work_id','client_id','question_version','basis_digest','fields','reason',
       'source_ref','answer_key','answered_role','delivery_state','delivery_attempts');
  if v_n <> 11 then
    raise exception '#629 tail: % of 11 new agent_interruptions columns are present', v_n using errcode='CLR10';
  end if;
  if to_regclass('clara.uq_agent_interruptions_work_version') is null then
    raise exception '#629 tail: the (work_id, question_version) unique index is absent' using errcode='CLR10';
  end if;

  raise notice '#629: work questions installed — agent_interruptions carries the Work identity (work_id/client_id/question_version/basis_digest), the typed fields, the reason/source ref and its own delivery state; clara.open_work_question (runtime) opens one, clara.answer_work_question (bookkeeper+) accepts exactly one current authorised answer with reserve-before-effect idempotency and typed converge refusals, clara.get_work_question / clara.get_work_pending_question serve the ONE record every surface renders, clara.expire_due_interruptions gives the 14-day deadline the enforcer it never had, and clara.list_review_queue offers the same question in Needs-you. Zero PUBLIC execute; no wake or agent grant anywhere.';
end
$w629_tail$;
