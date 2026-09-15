-- 0200_work_restate_supersede — #721: A REPLY THAT CHANGES THE BASIS BECOMES A NEW WORK.
-- =====================================================================================
-- Spec of record: issue #721 and the OWNER RULING of 2026-09-12 in that thread ("#721 的 ruling
-- 听你的"), four accepted-behaviour points and its placement note. Domain words: CONTEXT.md —
-- "Accounting basis", "Accounting work", "Restated Work / supersedes" (added by this change).
-- ARCHITECTURE §5 records the Work lane's cancel and question doors and this file's addition.
--
-- THE FINDING, IN ONE SENTENCE. `clara.admit_journal_work` (0178, thin-delegated by 0194)
-- canonicalises and digests the basis AT ADMISSION and freezes it (`t_accounting_work_immutable`),
-- and `clara._record_journal_entry_core` refuses any echo that does not hash to that digest — so a
-- Work question's answer can UNBLOCK a run (confirm, choose, explain) but can never change what
-- gets posted, and there was no honest place for a reply that means "no, the date is different".
--
-- WHAT THIS FILE SHIPS, IN THE RULING'S OWN FOUR POINTS.
--   1. `clara.answer_work_question` keeps its first-answer gate and gains ONE typed refusal,
--      `basis_change_not_allowed`, naming the element. The admitted basis never changes in place.
--   2. `clara.restate_accounting_work` — a NEW door — admits a NEW Work through the same
--      admission door the composer uses, with `supersedes = <old work>`, and cancels the old Work
--      through `clara.cancel_accounting_work` with `superseded_by = <new work>`, in ONE
--      transaction under ONE op key.
--   3. `clara.accounting_work` gains `supersedes` and `superseded_by`, both nullable, both
--      self-referencing, both SET-ONCE under `t_accounting_work_immutable`.
--   4. The link rides the `work.cancelled` event #750 registered (0199) — ONE producer, ONE type;
--      there is deliberately no sibling `work.superseded`.
--
-- =====================================================================================
-- WHY THE OLD WORK IS STAMPED BEFORE IT IS CANCELLED, and not after.
--
-- 0199's `cancel_accounting_work` appends its one `work.cancelled` event from the shared tail of
-- the two arms that actually cancel, and reads the successor off the row record it locked at the
-- top (`to_jsonb(w) -> 'superseded_by'`). So the link has to be ON THE ROW before that door is
-- called, or the feed's row would carry `superseded_by: null` for the one case the key exists for.
-- The alternative — stamping afterwards — would need either a SECOND event (which the ruling's
-- point 3 forbids: one producer, one type) or a parameter on `cancel_accounting_work`, which would
-- leave an overload of a live writer. Stamping first costs nothing: both statements are in ONE
-- transaction inside `clara.restate_accounting_work`, which holds the old Work's row lock across
-- both, so no reader ever observes the intermediate state.
--
-- THE IMMUTABILITY RULE THAT FOLLOWS FROM THAT ORDER, stated plainly because it is a DEVIATION
-- FROM THE LITERAL WORDS of the ruling's point 3 ("only together with the move to cancelled"):
-- `superseded_by` cannot be written in the same UPDATE that moves the status, because the status is
-- written by `clara.settle_work_run` inside the cancel door and the link must precede it. What the
-- trigger below enforces instead is the strongest rule that order admits:
--
--   * null -> value, EXACTLY ONCE. A second write — to another value or back to null — is refused
--     `accounting_work_immutable`, so a link can never be re-pointed or erased.
--   * only onto a Work that CAN still be cancelled, or one that already is: `queued`, `running`,
--     `awaiting_input`, `stopping`, `cancelled`. A `completed` / `refused` / `failed` / `expired`
--     Work is refused — a posted or settled Work is never retired in favour of a successor.
--   * never onto itself.
--
-- and `clara.restate_accounting_work` is the ONLY writer in the estate: the pair is written by no
-- other door, and `clara.accounting_work` carries no UPDATE grant to anybody but `clara_fn_owner`,
-- so the "together with the cancel" half is structural rather than trigger-enforced. A cell in
-- `packages/db/tests/work-cancel.test.mjs` drives both halves.
--
-- `supersedes` IS THE SAME SHAPE, ONE DIRECTION EARLIER. It is stamped onto the NEW Work
-- immediately after admission, because `clara.admit_journal_work`'s SIGNATURE MUST NOT MOVE: it is
-- named by a frozen chat tool and by the composer's HTTP route, and an added parameter would leave
-- an overload behind (#770's brief states the same rule for the same door). So the column is
-- set-once rather than frozen-at-insert, and the trigger refuses every later write to it.
--
-- =====================================================================================
-- WHEN `basis_change_not_allowed` FIRES, AND WHY IT IS NARROW.
--
-- The discriminator the ruling asks for ("an answer that would change any admitted basis element")
-- has to be read against the question shape 0180 actually ships, which has NO basis-element marker
-- on a field: `clara.agent_interruptions.fields` is a list of `{key, label, kind, required,
-- options, unit}` and nothing in it says "this key IS the posting date of the basis".
--
-- AND #629's OWN SHIPPED BEHAVIOUR ASKS FOR THOSE NAMES. A run legitimately asks "which date
-- should this be posted on?" with `{key: 'posting_date', kind: 'date'}`, and the human's reply
-- UNBLOCKS the run without changing the frozen basis (0178's digest law makes that impossible) —
-- that is the confirm/choose/explain case #721's own body says already works, and refusing it
-- would break it rather than fix anything.
--
-- SO THE ARM FIRES ON WHAT THE ANSWER CLAIMS, NOT ON WHAT THE QUESTION ASKED:
--
--   * the answer carries a `basis` or `basis_patch` member — an explicit attempt to restate the
--     basis through the answer door; or
--   * the answer carries a basis-element key (`account`, `amount`, `amount_cents`, `posting_date`,
--     `currency`, `evidence`, `memo`) THAT THIS QUESTION DID NOT DECLARE.
--
-- The second arm previously answered `invalid_answer` / `unknown_key` out of
-- `clara._assert_work_answer` — true, and useless: it named a key the caller "should not send"
-- where the honest answer is "that is a basis change; restate the instruction instead", which is
-- the affordance B3 now offers. Every OTHER undeclared key still answers `unknown_key`, unchanged.
-- ASSUMPTION, recorded for review: this is the conservative reading. A wider one (refusing every
-- basis-element key, declared or not) would red #629's shipped cells and remove a working path.
--
-- =====================================================================================
-- DEPLOY ORDER. NO CONSUMER-FIRST OBLIGATION for the two recuts (both keep their signature, grant
-- and every existing answer); the NEW door and the two columns are additive, so a runtime or web
-- image behind this file simply never calls or reads them. The web's `accounting_work` projection
-- DOES name the two new columns once it ships, which carries the same deploy-order obligation
-- 0184's `initiated_by` already put on that select (lib/work/types.ts states it).
--
-- ROLLBACK is a NEW append-only migration.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME:
--
-- clara.answer_work_question                                  (human lane, bookkeeper+)
--   CLR10 basis_change_not_allowed  detail.element = account|amount|posting_date|currency|
--                                   evidence|memo|basis          — NEW; every 0180 pair unchanged
--
-- clara.restate_accounting_work                               (runtime lane)
--   CLR10 invalid_op_key / op_key_conflict     — via clara._work_door_ctx
--   CLR11 work_not_found                       — via clara._work_door_ctx (no existence oracle)
--   CLR04 actor_not_active / insufficient_role — via clara._work_door_ctx
--   CLR13 operation_in_flight                  — via clara._work_door_ctx
--   CLR13 not_restatable      detail.status    — the old Work is not in a cancellable state
--   CLR13 already_superseded  detail.superseded_by — it already has a successor
--   CLR10 not_restatable_purpose detail.purpose— only a journal_entry Work is restated here
--   CLR10 intent_key_in_use   detail.work_id   — the intent key already names somebody else's Work
--   …plus every refusal clara.admit_journal_work and clara.cancel_accounting_work raise, verbatim.
--
-- clara._tf_accounting_work_immutable                         (trigger)
--   CLR08 accounting_work_immutable  detail.column = supersedes|superseded_by   — NEW columns
--   CLR08 superseded_by_requires_cancel detail.column='superseded_by'           — NEW
--   CLR08 supersedes_self            detail.column                              — NEW
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE.
-- =====================================================================================
do $w721_pre$
declare n text; v_sha text; v_n int;
begin
  foreach n in array array[
    'clara.answer_work_question(uuid,integer,jsonb,text)',
    'clara._assert_work_answer(jsonb,jsonb,uuid)',
    'clara._tf_accounting_work_immutable()',
    'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
    'clara.cancel_accounting_work(uuid,uuid,text)',
    'clara._work_door_ctx(uuid,uuid,text,text,text,text)',
    'clara._work_committed_receipt(uuid)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._finish_op(uuid,text,text,jsonb)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#721 prestate: prerequisite absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.1 · THE TWO COLUMNS ARE NOT ALREADY THERE.
  if exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='accounting_work'
        and column_name in ('supersedes','superseded_by')) then
    raise exception '#721 prestate: clara.accounting_work already carries a supersession column'
      using errcode='CLR10';
  end if;

  -- 0.2 · THE DOOR IS NEW. A same-named body would mean this file is re-cutting somebody else's.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='restate_accounting_work';
  if v_n <> 0 then
    raise exception '#721 prestate: clara.restate_accounting_work already exists (% bodies)', v_n
      using errcode='CLR10';
  end if;

  -- 0.3 · THE TWO BODIES THIS FILE RECUTS ARE THE ONES IT WAS DERIVED FROM, by prosrc sha-256.
  -- Both recuts are FULL-BODY copies with marked insertions; a body somebody else already recut
  -- would be silently reverted by applying them.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='answer_work_question';
  if v_n <> 1 then
    raise exception '#721 prestate: clara.answer_work_question has % bodies (expected 1)', v_n using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.answer_work_question(uuid,integer,jsonb,text)'::regprocedure;
  if v_sha <> 'c8fa8eb0c38381cdcd22901abc6851ed9845531bf68cf20b81612c5082d365f7' then
    raise exception '#721 prestate: the live clara.answer_work_question is NOT 0180 §E''s body (prosrc sha256 %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_accounting_work_immutable()'::regprocedure;
  if v_sha <> '7a68e97cf22053ea429a930deb7ff418fe7fb673397920b5a56c3f3520ba7f5d' then
    raise exception '#721 prestate: the live clara._tf_accounting_work_immutable is not the body this recut was derived from (prosrc sha256 %)', v_sha
      using errcode='CLR10';
  end if;

  -- 0.4 · #750's EVENT IS IN PLACE, because the link this file writes rides it and nothing else.
  if not exists (select 1 from clara.event_types where name='work.cancelled') then
    raise exception '#721 prestate: work.cancelled is not registered (migration 0199 has not been applied) -- the supersession link has no carrier'
      using errcode='CLR10';
  end if;
  if position('to_jsonb(w) -> ''superseded_by''' in
      (select p.prosrc from pg_proc p where p.oid='clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure)) = 0 then
    raise exception '#721 prestate: the live clara.cancel_accounting_work does not read superseded_by off the locked row -- 0199''s forward-compatible read is gone'
      using errcode='CLR10';
  end if;

  raise notice '#721 prestate: clean -- neither supersession column exists, clara.restate_accounting_work is new, clara.answer_work_question and clara._tf_accounting_work_immutable are the bodies this file derives from (prosrc sha256 pinned), and 0199''s work.cancelled carrier is in place.';
end
$w721_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE TWO COLUMNS. Nullable, self-referencing, and NOT unique-constrained: a unique index on
-- `superseded_by` would say "one Work may be superseded by at most one successor", which is true,
-- but the constraint that actually matters is the SET-ONCE rule below (a unique index would still
-- let a link be re-pointed). RESTRICT on both FKs: accounting work is never deleted anyway
-- (the immutability trigger's own DELETE arm), so the reference can only ever be dangling by a
-- catalog-level accident, and RESTRICT says so rather than quietly cascading.
-- =====================================================================================
alter table clara.accounting_work
  add column supersedes uuid null
    references clara.accounting_work(id) on delete restrict,
  add column superseded_by uuid null
    references clara.accounting_work(id) on delete restrict;

comment on column clara.accounting_work.supersedes is
  '#721: the Work this one was restated FROM. Set once, at restatement, by clara.restate_accounting_work.';
comment on column clara.accounting_work.superseded_by is
  '#721: the Work that replaced this one. Set once, immediately before the cancel that retires this Work.';

-- PARTIAL INDEXES, because the overwhelming majority of rows carry neither: the reads are "show me
-- the other half of this pair", always by a non-null value.
create index ix_accounting_work_supersedes on clara.accounting_work(supersedes)
  where supersedes is not null;
create index ix_accounting_work_superseded_by on clara.accounting_work(superseded_by)
  where superseded_by is not null;

-- =====================================================================================
-- §B  THE IMMUTABILITY TRIGGER — RECUT. The 0184/0194 body verbatim, plus ONE insertion block
-- marked `#721`, which is the whole of the change. `supersedes` is deliberately NOT added to
-- `v_frozen` (a frozen column may never move at all, and this one is stamped one statement after
-- the INSERT); its set-once rule is the insertion below.
-- =====================================================================================
create or replace function clara._tf_accounting_work_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  -- #643 · `adjustment_basis` joins the frozen set for the same reason `basis` is in it.
  v_frozen text[] := array['id','firm_id','client_id','purpose','initiated_by','initiator_role',
                           'intent_key','logical_op_id','basis','basis_digest','basis_origin',
                           'adjustment_basis','created_at'];
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
  -- #721 · THE SUPERSESSION PAIR — SET ONCE, NEVER RE-POINTED, NEVER ERASED.
  --
  -- Neither column is in `v_frozen`, and that is not an oversight: both are stamped by
  -- `clara.restate_accounting_work` one statement AFTER the row exists (`supersedes` because
  -- `clara.admit_journal_work`'s signature may not move; `superseded_by` because the cancel door
  -- must read it off the row it locks). So the rule is "exactly one transition out of null", which
  -- is the same guarantee a frozen column gives from the second statement onwards.
  if new.supersedes is distinct from old.supersedes then
    if old.supersedes is not null then
      raise exception 'accounting work column supersedes is set once and never re-pointed'
        using errcode='CLR08',
          detail='{"reason":"accounting_work_immutable","column":"supersedes"}';
    end if;
    if new.supersedes = new.id then
      raise exception 'accounting work cannot supersede itself' using errcode='CLR08',
        detail='{"reason":"supersedes_self","column":"supersedes"}';
    end if;
  end if;
  if new.superseded_by is distinct from old.superseded_by then
    if old.superseded_by is not null then
      raise exception 'accounting work column superseded_by is set once and never re-pointed'
        using errcode='CLR08',
          detail='{"reason":"accounting_work_immutable","column":"superseded_by"}';
    end if;
    if new.superseded_by = new.id then
      raise exception 'accounting work cannot be superseded by itself' using errcode='CLR08',
        detail='{"reason":"supersedes_self","column":"superseded_by"}';
    end if;
    -- …AND ONLY ONTO A WORK THAT IS BEING (OR HAS BEEN) CANCELLED. A Work that posted, was refused,
    -- failed or expired is never retired in favour of a successor: its outcome already stands and a
    -- link claiming otherwise would be a second, contradicting story about the same operation.
    if new.status not in ('queued','running','awaiting_input','stopping','cancelled') then
      raise exception 'accounting work in status % is never superseded', new.status
        using errcode='CLR08',
          detail=jsonb_build_object('reason','superseded_by_requires_cancel',
            'column','superseded_by','status',new.status)::text;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================================
-- §C  THE BASIS-CHANGE DISCRIMINATOR. One assertion, one place — the same discipline
-- `clara._assert_work_answer` is written under, so the vocabulary is not restated at the door.
-- =====================================================================================
create function clara._assert_answer_changes_no_basis(p_fields jsonb, p_answer jsonb) returns void
  language plpgsql immutable set search_path = clara, pg_temp as $$
declare
  -- The ruling's own six, plus `amount_cents` (the estate's spelling of `amount` on the wire),
  -- reported under the name the ruling uses.
  v_elements text[] := array['account','amount','amount_cents','posting_date','currency','evidence','memo'];
  v_declared text[] := '{}';
  f jsonb; k text; v_el text;
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' then return; end if;
  for f in select value from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    v_declared := v_declared || (f->>'key');
  end loop;
  for k in select jsonb_object_keys(p_answer) loop
    if k in ('basis','basis_patch') then
      -- NAME THE ELEMENT WHEN THE PAYLOAD NAMES ONE. A bare `basis` object that names none is
      -- reported as `basis`, which is the honest answer rather than a guessed element.
      v_el := null;
      if jsonb_typeof(p_answer->k) = 'object' then
        select e into v_el from unnest(v_elements) e
         where (p_answer->k) ? e order by array_position(v_elements, e) limit 1;
      end if;
      raise exception 'a question''s answer cannot change the admitted basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','basis_change_not_allowed',
            'element', case when v_el = 'amount_cents' then 'amount' else coalesce(v_el,'basis') end,
            'field', k)::text;
    end if;
    if k = any (v_elements) and not (k = any (v_declared)) then
      raise exception 'a question''s answer cannot change the admitted basis element %', k
        using errcode='CLR10',
          detail=jsonb_build_object('reason','basis_change_not_allowed',
            'element', case when k = 'amount_cents' then 'amount' else k end,
            'field', k)::text;
    end if;
  end loop;
end $$;
revoke all on function clara._assert_answer_changes_no_basis(jsonb,jsonb) from public;

-- =====================================================================================
-- §D  clara.answer_work_question — RECUT. 0180 §E's body with ONE assertion added, immediately
-- before `clara._assert_work_answer`, and NOTHING ELSE MOVED.
--
-- THE ORDER IS LOAD-BEARING. The new arm must come FIRST of the two, because the generic answer
-- assertion would otherwise reach an undeclared basis element and answer `unknown_key` — true and
-- useless. It comes AFTER every convergence arm (status, version, deadline, Work state, basis
-- digest) because those are facts about the RACE and must still win: a late answer to a question
-- that is already answered is `already_answered`, whatever it carries.
-- =====================================================================================
create or replace function clara.answer_work_question(p_question uuid, p_question_version int,
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

  -- #721 · AN ANSWER COMPLETES ONLY WHAT WAS ASKED. A reply that claims a basis element is not an
  -- answer to this question — it is a NEW instruction, and `clara.restate_accounting_work` is where
  -- it goes. Refused BEFORE the generic answer assertion so the diagnosis names the basis rather
  -- than "a key this question did not ask for".
  perform clara._assert_answer_changes_no_basis(i.fields, p_answer);

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
-- §E  clara.restate_accounting_work — THE NEW DOOR.
--
-- RUNTIME LANE, mirroring `clara.cancel_accounting_work`'s and `clara.take_over_accounting_work`'s
-- posture exactly: granted to `clara_runtime` alone (the web reaches it through
-- `POST /api/work/:id/restate`, which authenticates the human and passes their `sub`), no existence
-- oracle across firms, an op-key reservation before any effect, and the author's LIVE membership
-- re-read at the door — all of it through the SHARED PREAMBLE `clara._work_door_ctx`, which is the
-- same one `cancel` opens with.
--
-- ONE CODE PATH FOR ADMISSION, and it is the composer's. `clara.admit_journal_work` is CALLED
-- rather than copied — the same choice `take_over_accounting_work` makes for run creation — so the
-- basis assertions, the evidence checks, the intent-key idempotency, the logical identity and the
-- audit row are generated in exactly one place. Its SIGNATURE IS NOT TOUCHED (an added parameter
-- would leave an overload of a door a frozen chat tool names), so `supersedes` is stamped by the
-- statement immediately after.
--
-- THE ORDER OF THE FOUR WRITES IS THE CONTRACT:
--   1. admit the NEW Work            — if this refuses, nothing has happened to the old one;
--   2. stamp `supersedes` on it      — set-once (§B);
--   3. stamp `superseded_by` on the OLD Work — BEFORE the cancel, so 0199's single work.cancelled
--      event carries the link (this file's header says why that order, and no other, works);
--   4. cancel the old Work           — through its own door, under a DERIVED op key
--                                      ('restate:' || p_op_key), the same idiom the takeover uses.
-- All four are in ONE transaction and the old Work's row lock is held across all of them.
-- =====================================================================================
create function clara.restate_accounting_work(p_work uuid, p_author uuid, p_intent_key text,
    p_basis jsonb, p_basis_origin text, p_source_refs jsonb, p_model text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_ctx jsonb; v_admit jsonb; v_new uuid; v_cancel jsonb; v_result jsonb;
  v_existing_supersedes uuid;
begin
  v_ctx := clara._work_door_ctx(p_work, p_author, p_op_key,
    'restate_accounting_work', 'restatement', 'restating');
  if v_ctx ? 'dedupe' then return (v_ctx->'dedupe') || '{"replayed":true}'::jsonb; end if;

  -- THE BOUNDARY, in the lane's own order: accounting_work FIRST, the same row the posting core
  -- and the cancel door take.
  select * into w from clara.accounting_work aw where aw.id = p_work for update;

  if w.purpose <> 'journal_entry' then
    raise exception 'only a journal-entry Work is restated through this door (got %)', w.purpose
      using errcode='CLR10',
        detail=jsonb_build_object('reason','not_restatable_purpose','purpose',w.purpose)::text;
  end if;
  if w.superseded_by is not null then
    raise exception 'this Work has already been superseded' using errcode='CLR13',
      detail=jsonb_build_object('reason','already_superseded','superseded_by',w.superseded_by)::text;
  end if;
  -- THE SAME THREE STATUSES "Cancel Work" IS OFFERED FROM, and for the same reason: a restatement
  -- is a cancel with a successor, so a Work the cancel door would answer `already_completed`,
  -- `already_terminal` or `already_stopping` for must be refused HERE — before a new Work is
  -- admitted for figures whose predecessor is not actually going away.
  if w.status not in ('queued','running','awaiting_input') then
    raise exception 'a Work in status % is not restatable', w.status using errcode='CLR13',
      detail=jsonb_build_object('reason','not_restatable','status',w.status)::text;
  end if;
  if clara._work_committed_receipt(p_work) is not null then
    raise exception 'this Work already posted; a correction is a separate, linked operation'
      using errcode='CLR13', detail=jsonb_build_object('reason','not_restatable','status','completed')::text;
  end if;

  -- 1 · THE NEW WORK, through the composer's own door.
  v_admit := clara.admit_journal_work(w.client_id, p_author, p_intent_key, p_basis,
    p_basis_origin, p_source_refs, p_model);
  v_new := (v_admit->>'work_id')::uuid;
  if v_new = p_work then
    raise exception 'a Work cannot supersede itself' using errcode='CLR10',
      detail='{"reason":"intent_key_in_use","column":"supersedes"}';
  end if;

  -- 2 · `supersedes`, set once. A REPLAYED admission (the same intent key, the same figures) is
  -- not an error: it means this restatement is being completed after a lost response. It IS an
  -- error when the replayed Work was restated from somewhere ELSE — the key then names somebody
  -- else's Work and stamping it would re-point a set-once column.
  select aw.supersedes into v_existing_supersedes from clara.accounting_work aw where aw.id = v_new;
  if v_existing_supersedes is null then
    update clara.accounting_work set supersedes = p_work where id = v_new;
  elsif v_existing_supersedes <> p_work then
    raise exception 'that intent key already names a Work restated from a different one'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','intent_key_in_use','work_id',v_new)::text;
  end if;

  -- 3 · `superseded_by` on the OLD Work, BEFORE the cancel — 0199's event reads it off the row
  -- the cancel door locks, and that is the only carrier the link has (#721 ruling, point 3).
  update clara.accounting_work set superseded_by = v_new where id = p_work;

  -- 4 · THE CANCEL, through its own door and under a DERIVED key, so the restatement's key and the
  -- cancellation's key are distinguishable in `clara.op_receipts` and neither can collide with a
  -- plain "Cancel Work" press the human also made.
  v_cancel := clara.cancel_accounting_work(p_work, p_author, 'restate:' || p_op_key);

  perform clara._audit(w.firm_id, p_author, null, null, 'restate_accounting_work', null,
    jsonb_build_object('work', p_work, 'new_work', v_new, 'client', w.client_id,
      'intent_key', p_intent_key, 'op_key', p_op_key,
      'from_status', w.status, 'cancel', v_cancel));

  v_result := jsonb_build_object(
    'work_id', v_new, 'task_id', v_admit->'task_id',
    'logical_op_id', v_admit->>'logical_op_id', 'status', v_admit->>'status',
    'supersedes', p_work,
    'superseded', jsonb_build_object('work_id', p_work,
      'status', (select aw.status from clara.accounting_work aw where aw.id = p_work),
      'cancelled', v_cancel->'cancelled', 'reason', v_cancel->'reason'),
    'replayed', false);
  return clara._finish_op(w.firm_id, 'restate_accounting_work', p_op_key, v_result);
end $$;
revoke all on function clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text) from public;
grant execute on function clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text) to clara_runtime;
comment on function clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text) is
  '#721 B3/rail "Restate as a new instruction". Admits a NEW journal Work through '
  'clara.admit_journal_work with supersedes = the old Work, and cancels the old Work through '
  'clara.cancel_accounting_work with superseded_by = the new one, in ONE transaction under one '
  'op key. clara_runtime ONLY. The admitted basis is never edited in place.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS.
-- =====================================================================================
do $w721_tail$
declare v_src text; v_n int; v_posture text; v_missing text;
begin
  -- 1 · THE COLUMNS, their nullability and their self-reference.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work'
     and column_name in ('supersedes','superseded_by') and is_nullable='YES' and data_type='uuid';
  if v_n <> 2 then
    raise exception '#721 tail: expected 2 nullable uuid supersession columns; found %', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint co
   where co.conrelid='clara.accounting_work'::regclass and co.contype='f'
     and co.confrelid='clara.accounting_work'::regclass;
  if v_n < 2 then
    raise exception '#721 tail: the supersession columns are not both self-referencing foreign keys (found % self FKs)', v_n
      using errcode='CLR10';
  end if;

  -- 2 · THE TRIGGER'S NEW ARMS, against the COMMITTED text, and every arm it already had.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  v_missing := '';
  if position('superseded_by_requires_cancel' in v_src) = 0 then v_missing := v_missing || ' cancel-gate'; end if;
  if position('supersedes_self' in v_src) = 0 then v_missing := v_missing || ' self-link'; end if;
  if position('old.supersedes is not null' in v_src) = 0 then v_missing := v_missing || ' supersedes-set-once'; end if;
  if position('old.superseded_by is not null' in v_src) = 0 then v_missing := v_missing || ' superseded_by-set-once'; end if;
  -- …and NOTHING 0184/0194 enforced left.
  if position('''adjustment_basis''' in v_src) = 0 then v_missing := v_missing || ' frozen-set'; end if;
  if position('responsible_not_authorised' in v_src) = 0 then v_missing := v_missing || ' initiator-wall'; end if;
  if position('accounting work is never deleted' in v_src) = 0 then v_missing := v_missing || ' delete-arm'; end if;
  if position('new.updated_at := now()' in v_src) = 0 then v_missing := v_missing || ' updated_at'; end if;
  if v_missing <> '' then
    raise exception '#721 tail: the immutability trigger is missing arm(s):%', v_missing using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid='clara.accounting_work'::regclass
                   and t.tgname='t_accounting_work_immutable' and not t.tgisinternal) then
    raise exception '#721 tail: t_accounting_work_immutable is no longer attached' using errcode='CLR10';
  end if;

  -- 3 · THE ANSWER DOOR: the new arm is there, it runs BEFORE the generic assertion, and every
  -- 0180 arm survived.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='answer_work_question';
  if v_n <> 1 then
    raise exception '#721 tail: clara.answer_work_question now has % bodies (expected 1)', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.answer_work_question(uuid,integer,jsonb,text)'::regprocedure;
  if position('clara._assert_answer_changes_no_basis(' in v_src) = 0 then
    raise exception '#721 tail: the committed clara.answer_work_question does not assert the basis-change rule' using errcode='CLR10';
  end if;
  if position('clara._assert_answer_changes_no_basis(' in v_src) > position('clara._assert_work_answer(' in v_src) then
    raise exception '#721 tail: the basis-change assertion runs AFTER the generic answer assertion -- an undeclared basis element would be diagnosed unknown_key' using errcode='CLR10';
  end if;
  v_missing := '';
  if position('clara._human_ctx(clara.role_rank(''bookkeeper''))' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('clara._reserve_op(c.firm, ''answer_work_question''' in v_src) = 0 then v_missing := v_missing || ' reserve'; end if;
  if position('op_key_conflict' in v_src) = 0 then v_missing := v_missing || ' op-key-conflict'; end if;
  if position('operation_in_flight' in v_src) = 0 then v_missing := v_missing || ' in-flight'; end if;
  if position('where id = p_question for update' in v_src) = 0 then v_missing := v_missing || ' row-lock'; end if;
  if position('question_not_found' in v_src) = 0 then v_missing := v_missing || ' no-oracle'; end if;
  if position('already_answered' in v_src) = 0 then v_missing := v_missing || ' first-answer-gate'; end if;
  if position('stale_question' in v_src) = 0 then v_missing := v_missing || ' version-gate'; end if;
  if position('i.expires_at < clock_timestamp()' in v_src) = 0 then v_missing := v_missing || ' deadline'; end if;
  if position('state_changed' in v_src) = 0 then v_missing := v_missing || ' work-state'; end if;
  if position('basis_changed' in v_src) = 0 then v_missing := v_missing || ' basis-digest'; end if;
  if position('clara._assert_work_answer(' in v_src) = 0 then v_missing := v_missing || ' answer-shape'; end if;
  if position('pg_notify(''clara_runtime_ctl''' in v_src) = 0 then v_missing := v_missing || ' notify'; end if;
  if v_missing <> '' then
    raise exception '#721 tail: the answer-door recut LOST arm(s):%', v_missing using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid='clara.answer_work_question(uuid,integer,jsonb,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#721 tail: clara.answer_work_question has the wrong posture; got {%}', v_posture using errcode='CLR10';
  end if;

  -- 4 · THE NEW DOOR: one body, the right posture, and the four writes in the right order.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='restate_accounting_work';
  if v_n <> 1 then
    raise exception '#721 tail: clara.restate_accounting_work has % bodies (expected 1)', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)'::regprocedure;
  if position('clara._work_door_ctx(' in v_src) = 0 then
    raise exception '#721 tail: the new door does not open with the shared work-door preamble' using errcode='CLR10';
  end if;
  if position('clara.admit_journal_work(' in v_src) = 0 then
    raise exception '#721 tail: the new door does not admit through clara.admit_journal_work -- a copied admission is a second place for the basis law to drift' using errcode='CLR10';
  end if;
  -- THE ORDER: the successor stamp precedes the cancel, which is the whole reason the event
  -- carries the link.
  if position('set superseded_by = v_new where id = p_work' in v_src) = 0
     or position('set superseded_by = v_new where id = p_work' in v_src)
        > position('clara.cancel_accounting_work(' in v_src) then
    raise exception '#721 tail: the new door does not stamp superseded_by BEFORE it cancels -- the work.cancelled event would carry a null link' using errcode='CLR10';
  end if;
  if position('''restate:'' || p_op_key' in v_src) = 0 then
    raise exception '#721 tail: the cancel leg does not use a derived op key' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid='clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#721 tail: clara.restate_accounting_work has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path-pinned and EXECUTE to clara_runtime only; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · clara.admit_journal_work IS UNTOUCHED, and there is exactly ONE of it. The whole point of
  -- calling it rather than widening it.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='admit_journal_work';
  if v_n <> 1 then
    raise exception '#721 tail: clara.admit_journal_work now has % bodies -- an overload was created', v_n using errcode='CLR10';
  end if;

  -- 6 · NO SIBLING EVENT TYPE. The link rides work.cancelled and nothing else.
  if exists (select 1 from clara.event_types where name = 'work.superseded') then
    raise exception '#721 tail: a work.superseded event type was registered -- the ruling says one producer, one type' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.event_types where name like 'work.%';
  if v_n <> 2 then
    raise exception '#721 tail: expected exactly 2 work.%% event types; found %', v_n using errcode='CLR10';
  end if;

  raise notice '#721 tail: OK -- clara.accounting_work carries `supersedes` and `superseded_by` (nullable uuid, self-referencing, partially indexed); t_accounting_work_immutable admits exactly one null->value transition on each, refuses a re-point or an erase as accounting_work_immutable, refuses a self-link, refuses superseded_by on any Work that is not queued/running/awaiting_input/stopping/cancelled, and keeps every arm it already had (the frozen column set incl. adjustment_basis, the initiator authority wall, the DELETE refusal and the updated_at stamp); clara.answer_work_question keeps its bookkeeper floor, reservation, row lock, first-answer gate, version gate, deadline, Work-state and basis-digest convergence and its clara_authenticated-only grant, and gains clara._assert_answer_changes_no_basis AHEAD of the generic answer assertion so a reply claiming a basis element answers basis_change_not_allowed naming the element; clara.restate_accounting_work is a new clara_runtime-only SECURITY DEFINER door that opens with the shared work-door preamble, admits the successor through the UNWIDENED clara.admit_journal_work, stamps supersedes on it, stamps superseded_by on the predecessor BEFORE cancelling it under a derived op key, and therefore rides the single work.cancelled event 0199 registered; no work.superseded sibling type exists.';
end
$w721_tail$;
